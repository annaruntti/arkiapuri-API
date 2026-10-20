import type {
  IFoodItem,
  IFoodItemNutrition,
  IFoodItemOpenFoodFacts,
} from "../models/foodItem"
import type { IPantryItem } from "../models/pantry"
import {
  parseQuantity,
  sanitizeBarcode,
  sanitizeHttpUrl,
} from "../helpers/controllerUtils"
import {
  findFirstLocationOfType,
  findPantryLocation,
  hydratePantryLocations,
  inferLocationTypeFromCategories,
} from "../helpers/pantryLocations"
import {
  pruneStaleRemovalSuggestions,
  syncExpiredRemovalSuggestions,
} from "../helpers/pantrySuggestions"
import { getCanonicalPantry } from "../helpers/pantryHelpers"

export const parsePantryQuantity = (
  value: number | string | undefined
): number => parseQuantity(value, { fallback: 1, min: 0 })

export const resolvePantryLocationId = (
  pantry: Awaited<ReturnType<typeof getCanonicalPantry>>,
  locationId: unknown
) => {
  if (locationId == null || locationId === "") return null
  const location = findPantryLocation(pantry, locationId)
  return location?._id ?? null
}

export const persistPantrySideEffects = (
  pantry: Awaited<ReturnType<typeof getCanonicalPantry>>
): boolean => {
  const locationsHydrated = hydratePantryLocations(pantry)
  const pruned = pruneStaleRemovalSuggestions(pantry)
  const expiredSynced = syncExpiredRemovalSuggestions(pantry)
  return locationsHydrated || pruned || expiredSynced
}

export const resolveLocationFromStorageCategories = (
  pantry: Awaited<ReturnType<typeof getCanonicalPantry>>,
  categories: unknown[] | undefined
) => {
  const type = inferLocationTypeFromCategories(categories)
  if (!type) return null
  return findFirstLocationOfType(pantry, type)?._id ?? null
}

export const applyPantryScanMetadata = (
  foodItem: IFoodItem,
  data: {
    imageUrl?: string
    barcode?: string
    openFoodFactsData?: IFoodItemOpenFoodFacts
    nutrition?: IFoodItemNutrition
  }
) => {
  const imageUrl = sanitizeHttpUrl(
    data.imageUrl || data.openFoodFactsData?.imageUrl
  )
  if (imageUrl && !foodItem.image?.url) {
    foodItem.image = { url: imageUrl }
  }

  const barcode = sanitizeBarcode(
    data.barcode || data.openFoodFactsData?.barcode
  )
  if (!imageUrl && !barcode && !data.openFoodFactsData) return

  const offData = data.openFoodFactsData
  const {
    imageUrl: _offImage,
    barcode: _offBarcode,
    nutrition: offNutrition,
    ...offRest
  } = offData || {}

  foodItem.openFoodFactsData = {
    ...(foodItem.openFoodFactsData || {}),
    ...offRest,
    ...(barcode ? { barcode } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    nutrition: {
      ...(foodItem.openFoodFactsData?.nutrition || {}),
      ...(offNutrition || {}),
      ...(data.nutrition || {}),
    },
    lastUpdated: new Date(),
  }
}
