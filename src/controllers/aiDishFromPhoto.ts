import { Response } from "express"
import type { Model } from "mongoose"
import type { IFoodItem } from "../models/foodItem"
import {
  AuthenticatedRequest,
  getErrorMessage,
  resolveModule,
} from "../helpers/controllerUtils"
import { parseAiImageBody } from "../helpers/aiImageRequest"
import { getHouseholdMemberIds, resolveHouseholdId } from "../helpers/householdHelpers"
import {
  BudgetExceededError,
  consumeAiCredits,
  QuotaExceededError,
  refundAiCredits,
} from "../services/ai/aiUsage"
import { FEATURE_CREDIT_COST, FEATURE_ESTIMATED_USD } from "../services/ai/config"
import { scanDishFromPhoto } from "../services/ai/useCases/dishFromPhoto"
import { AiNotConfiguredError, AiResponseError } from "../services/ai/llmClient"
import type { CatalogFoodMatch } from "../services/ai/types"
import { toCatalogFoodMatch } from "../services/foodNameLookup"

const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))

export const scanDish = async (
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

  const parsed = parseAiImageBody(req.body || {})
  if (parsed.ok === false) {
    return res.status(parsed.status).json({
      success: false,
      message: parsed.message,
    })
  }

  const feature = "dish_from_photo" as const
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

      const catalogDocs = await FoodItem.find(catalogQuery)
        .select("name category unit calories nutrition image openFoodFactsData")
        .lean()
      const catalog: CatalogFoodMatch[] = catalogDocs.map(toCatalogFoodMatch)

      const result = await scanDishFromPhoto({
        image: parsed.image,
        catalog,
      })
      consumedCost = result.estimatedCostUsd || consumedCost

      res.json({
        success: true,
        meal: result.meal,
        ingredients: result.ingredients,
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
    console.error("Dish-from-photo error:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}
