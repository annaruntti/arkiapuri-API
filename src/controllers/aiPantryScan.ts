import { Response } from "express"
import type { Model } from "mongoose"
import type { IFoodItem } from "../models/foodItem"
import {
  AuthenticatedRequest,
  getErrorMessage,
  resolveModule,
} from "../helpers/controllerUtils"
import { getHouseholdMemberIds, resolveHouseholdId } from "../helpers/householdHelpers"
import { getCanonicalPantry } from "../helpers/pantryHelpers"
import { getAiEntitlement } from "../services/ai/entitlement"
import {
  BudgetExceededError,
  consumeAiCredits,
  QuotaExceededError,
  refundAiCredits,
} from "../services/ai/aiUsage"
import { FEATURE_CREDIT_COST, FEATURE_ESTIMATED_USD } from "../services/ai/config"
import { scanPantryImage } from "../services/ai/useCases/pantryScan"
import { AiNotConfiguredError, AiResponseError } from "../services/ai/llmClient"
import type { CatalogFoodMatch } from "../services/ai/types"
import { toCatalogFoodMatch } from "../services/foodNameLookup"

const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))

const MAX_IMAGE_CHARS = 7_000_000
const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"])

const stripDataUri = (value: string): { base64: string; mimeType?: string } => {
  const match = String(value || "").match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
  )
  if (match) {
    return { mimeType: match[1], base64: match[2] }
  }
  return { base64: String(value || "").replace(/\s/g, "") }
}

export const getAiStatus = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const entitlement = await getAiEntitlement(req.user)
    res.json({
      success: true,
      entitlement,
      featureCosts: FEATURE_CREDIT_COST,
    })
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const scanPantry = async (
  req: AuthenticatedRequest<
    Record<string, string>,
    unknown,
    { image?: string; mimeType?: string }
  >,
  res: Response
) => {
  const entitlement = req.aiEntitlement
  if (!entitlement) {
    return res.status(401).json({ success: false, message: "unauthorized access!" })
  }

  const rawImage = req.body?.image
  if (!rawImage || typeof rawImage !== "string") {
    return res.status(400).json({
      success: false,
      message: "Kuva puuttuu",
    })
  }

  const parsed = stripDataUri(rawImage)
  const mimeType = (req.body.mimeType || parsed.mimeType || "image/jpeg").toLowerCase()
  if (!ALLOWED_MIME.has(mimeType)) {
    return res.status(400).json({
      success: false,
      message: "Kuvan tyyppi ei ole tuettu. Käytä JPEG-, PNG- tai WebP-kuvaa.",
    })
  }
  if (parsed.base64.length > MAX_IMAGE_CHARS) {
    return res.status(413).json({
      success: false,
      message: "Kuva on liian suuri. Pienennä kuvaa ja yritä uudelleen.",
    })
  }

  const feature = "pantry_scan" as const
  let consumedCost = FEATURE_ESTIMATED_USD[feature]

  try {
    const reserved = await consumeAiCredits({
      ownerType: entitlement.ownerType,
      ownerId: entitlement.ownerId,
      feature,
    })

    try {
      const householdId = resolveHouseholdId(req.user)
      const memberIds = householdId
        ? await getHouseholdMemberIds(householdId)
        : []
      const catalogQuery =
        memberIds.length > 0
          ? { user: { $in: memberIds } }
          : { user: req.user._id }

      const [catalogDocs, pantry] = await Promise.all([
        FoodItem.find(catalogQuery)
          .select("name category unit calories nutrition openFoodFactsData")
          .lean(),
        getCanonicalPantry(req.user),
      ])

      const catalog: CatalogFoodMatch[] = catalogDocs.map(toCatalogFoodMatch)
      const pantryNames = pantry.items.map((item) => item.name)

      const result = await scanPantryImage({
        image: { base64: parsed.base64, mimeType },
        catalog,
        pantryNames,
      })
      consumedCost = result.estimatedCostUsd || consumedCost

      res.json({
        success: true,
        items: result.items,
        model: result.model,
        usage: {
          remainingCredits: reserved.remainingCredits,
          creditLimit: entitlement.creditLimit,
          creditsCharged: FEATURE_CREDIT_COST[feature],
        },
      })
    } catch (error: unknown) {
      await refundAiCredits({
        ownerType: entitlement.ownerType,
        ownerId: entitlement.ownerId,
        feature,
        estimatedCostUsd: consumedCost,
      })
      throw error
    }
  } catch (error: unknown) {
    if (error instanceof QuotaExceededError) {
      return res.status(403).json({
        success: false,
        code: "quota_exceeded",
        message:
          "Tämän kuun AI-kiintiö on käytetty. Kiintiö nollautuu seuraavan laskutuskauden alussa.",
      })
    }
    if (error instanceof BudgetExceededError) {
      return res.status(503).json({
        success: false,
        code: "budget_exceeded",
        message:
          "AI-palvelu on tilapäisesti pois käytöstä. Yritä myöhemmin uudelleen.",
      })
    }
    if (error instanceof AiNotConfiguredError) {
      return res.status(503).json({
        success: false,
        code: "not_configured",
        message: "AI-palvelua ei ole vielä otettu käyttöön.",
      })
    }
    if (error instanceof AiResponseError) {
      return res.status(502).json({
        success: false,
        message: error.message,
      })
    }
    console.error("Pantry scan error:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}
