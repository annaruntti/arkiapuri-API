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
import { findPantryLocation, sameLocationId } from "../helpers/pantryLocations"
import {
  matchMissingLocationItems,
  replacePhotoMissingSuggestions,
} from "../helpers/pantrySuggestions"
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
import { parseAiImageBody } from "../helpers/aiImageRequest"

const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))

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
    { image?: string; mimeType?: string; locationId?: string }
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

  const pantry = await getCanonicalPantry(req.user)
  const location = findPantryLocation(pantry, req.body.locationId)
  if (!req.body.locationId || !location) {
    return res.status(400).json({
      success: false,
      message: "Valitse säilytyspaikka, jota kuvaat.",
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

      const catalogDocs = await FoodItem.find(catalogQuery)
        .select("name category unit calories nutrition image openFoodFactsData")
        .lean()

      const catalog: CatalogFoodMatch[] = catalogDocs.map(toCatalogFoodMatch)
      const locationItems = pantry.items.filter((item) =>
        sameLocationId(item.locationId, location._id)
      )
      const pantryNames = locationItems
        .map((item) => item.name)
        .filter(Boolean)

      const result = await scanPantryImage({
        image: parsed.image,
        catalog,
        pantryNames,
        locationName: location.name,
      })
      consumedCost = result.estimatedCostUsd || consumedCost

      const missingItems = matchMissingLocationItems(
        locationItems,
        result.items,
        result.clearlyAbsentNames
      )
      replacePhotoMissingSuggestions(pantry, location._id, missingItems)
      await pantry.save()

      const suggestedRemovals = missingItems.map((item) => ({
        itemId: String(item._id),
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        locationId: String(location._id),
        locationName: location.name,
        reason: "missing_from_photo" as const,
      }))

      res.json({
        success: true,
        items: result.items,
        suggestedRemovals,
        location: {
          _id: String(location._id),
          name: location.name,
          type: location.type,
        },
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
