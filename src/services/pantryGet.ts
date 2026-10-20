import type { IFoodItem } from "../models/foodItem"
import type { IUser } from "../models/user"
import {
  depopulatePantryFoodIds,
  getCanonicalPantry,
  mergeDuplicatePantryItems,
  mergeProcessedPantryItems,
} from "../helpers/pantryHelpers"
import {
  hydratePantryLocations,
  locationIdString,
} from "../helpers/pantryLocations"
import {
  pruneStaleRemovalSuggestions,
  serializeActiveRemovalSuggestions,
  syncExpiredRemovalSuggestions,
} from "../helpers/pantrySuggestions"
import { normalizeAppUnit } from "../utils/openFoodFactsMapper"

/**
 * Load, normalize, and serialize the user's pantry for API responses.
 */
export const getPantryForUser = async (user: IUser) => {
  const pantry = await getCanonicalPantry(user)
  await pantry.populate({ path: "items.foodId" })

  let touched = false
  for (const item of pantry.items) {
    const normalizedUnit = normalizeAppUnit(item.unit)
    if (item.unit !== normalizedUnit) {
      item.unit = normalizedUnit
      touched = true
    }
    if (!item.name?.trim()) {
      const foodItemData =
        item.foodId && typeof item.foodId === "object"
          ? (item.foodId as unknown as Partial<IFoodItem>)
          : null
      if (foodItemData?.name) {
        item.name = foodItemData.name
        touched = true
      }
    }
  }

  const hydrated = hydratePantryLocations(pantry)
  const merged = mergeDuplicatePantryItems(pantry)
  const pruned = pruneStaleRemovalSuggestions(pantry)
  const expiredSynced = syncExpiredRemovalSuggestions(pantry)
  if (hydrated || merged || touched || pruned || expiredSynced) {
    depopulatePantryFoodIds(pantry)
    await pantry.save()
    await pantry.populate({ path: "items.foodId" })
  }

  const processedItems = mergeProcessedPantryItems(
    pantry.items.map((item) => {
      const foodItemData =
        item.foodId &&
        typeof item.foodId === "object" &&
        item.foodId !== null &&
        "name" in (item.foodId as object)
          ? (item.foodId as unknown as Partial<IFoodItem>)
          : {}
      const raw =
        typeof item.toObject === "function" ? item.toObject() : { ...item }
      return {
        ...raw,
        name: (item.name || foodItemData.name || "Nimetön tuote").trim(),
        category: foodItemData.category || item.category || [],
        unit: normalizeAppUnit(item.unit || foodItemData.unit),
        calories: foodItemData.calories || item.calories || 0,
        price: foodItemData.price || item.price || 0,
        locationId: locationIdString(item.locationId),
        image:
          foodItemData.image ||
          (foodItemData.openFoodFactsData?.imageUrl
            ? { url: foodItemData.openFoodFactsData.imageUrl }
            : null),
      }
    })
  )

  const pantryObject = pantry.toObject()
  return {
    ...pantryObject,
    items: processedItems,
    locations: pantryObject.locations || [],
    removalSuggestions: serializeActiveRemovalSuggestions(pantry),
  }
}
