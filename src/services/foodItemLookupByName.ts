import type { FilterQuery, Model } from "mongoose"
import type { IFoodItem } from "../models/foodItem"
import type { IUser } from "../models/user"
import { resolveModule } from "../helpers/controllerUtils"
import {
  getHouseholdMemberIds,
  resolveHouseholdId,
} from "../helpers/householdHelpers"
import {
  lookupFoodsByName,
  toCatalogFoodMatch,
  type FoodNameLookupResult,
} from "./foodNameLookup"

const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))

export type LookupFoodItemsByNameResult =
  | { status: "ok"; results: FoodNameLookupResult[] }
  | { status: "bad_request"; message: string }

/**
 * Match product names against the user's/household catalog (+ OFF fallbacks).
 */
export const lookupFoodItemsByNameForUser = async (
  user: IUser,
  body: { name?: string; names?: string[] }
): Promise<LookupFoodItemsByNameResult> => {
  const names = Array.isArray(body?.names)
    ? body.names
    : body?.name
      ? [body.name]
      : []
  const cleaned = names
    .map((name) => String(name || "").trim())
    .filter(Boolean)

  if (cleaned.length === 0) {
    return { status: "bad_request", message: "Tuotenimi puuttuu" }
  }

  const householdId = resolveHouseholdId(user)
  const memberIds = householdId ? await getHouseholdMemberIds(householdId) : []
  const catalogQuery: FilterQuery<IFoodItem> =
    memberIds.length > 0
      ? { user: { $in: memberIds } }
      : { user: user._id }

  const catalogDocs = await FoodItem.find(catalogQuery)
    .select("name category unit calories nutrition image openFoodFactsData")
    .lean()

  const results = await lookupFoodsByName(
    cleaned,
    catalogDocs.map(toCatalogFoodMatch)
  )

  return { status: "ok", results }
}
