import { pantryItemMergeKey } from "../helpers/pantryHelpers"
import { inferFoodCategories } from "./ai/productNormalizer"
import type {
  CatalogFoodMatch,
  FoodMatchSource,
  FoodNutrition,
} from "./ai/types"
import openFoodFactsService from "./openFoodFactsService"
import { mapOpenFoodFactsToFoodItemFields } from "../utils/openFoodFactsMapper"

export interface FoodNameLookupResult {
  query: string
  name: string
  category: string[]
  calories?: number
  nutrition?: FoodNutrition
  foodId: string | null
  barcode?: string
  matchName?: string
  source: FoodMatchSource
}

const MAX_NAMES = 40
const OFF_CONCURRENCY = 3

const hasMacroValues = (nutrition?: FoodNutrition): boolean => {
  if (!nutrition) return false
  return ["calories", "proteins", "carbohydrates", "fat"].some((key) => {
    const value = Number(nutrition[key as keyof FoodNutrition])
    return Number.isFinite(value) && value > 0
  })
}

const pickCalories = (item?: {
  calories?: number
  nutrition?: FoodNutrition
}): number | undefined => {
  const calories = item?.calories ?? item?.nutrition?.calories
  return Number.isFinite(Number(calories)) && Number(calories) > 0
    ? Number(calories)
    : undefined
}

const pickNutrition = (item?: {
  calories?: number
  nutrition?: FoodNutrition
}): FoodNutrition | undefined => {
  if (!item) return undefined
  const calories = pickCalories(item)
  if (!item.nutrition && calories == null) return undefined
  const merged = {
    ...(item.nutrition || {}),
    ...(calories != null ? { calories } : {}),
  }
  return hasMacroValues(merged) || Object.keys(item.nutrition || {}).length
    ? merged
    : undefined
}

export const toCatalogFoodMatch = (item: {
  _id: unknown
  name?: string
  category?: string[]
  unit?: string
  calories?: number
  nutrition?: FoodNutrition
  openFoodFactsData?: { nutrition?: FoodNutrition }
}): CatalogFoodMatch => ({
  _id: String(item._id),
  name: item.name || "",
  category: item.category || [],
  unit: item.unit || "kpl",
  calories: pickCalories(item),
  nutrition: pickNutrition({
    calories: item.calories,
    nutrition: {
      ...(item.openFoodFactsData?.nutrition || {}),
      ...(item.nutrition || {}),
    },
  }),
})

const fromCatalog = (
  query: string,
  match: CatalogFoodMatch
): FoodNameLookupResult => ({
  query,
  name: match.name,
  category: match.category?.length
    ? match.category
    : inferFoodCategories(match.name),
  calories: pickCalories(match),
  nutrition: pickNutrition(match),
  foodId: match._id,
  matchName: match.name,
  source: "catalog",
})

const fromOpenFoodFacts = (
  query: string,
  product: {
    name?: string
    barcode?: string
    nutrition?: FoodNutrition
    categories?: string[]
    mainCategory?: string | null
    quantity?: string | null
    productQuantity?: number | string | null
    productQuantityUnit?: string | null
    brands?: string
    imageUrl?: string | null
    imageFrontUrl?: string | null
  }
): FoodNameLookupResult => {
  const mapped = mapOpenFoodFactsToFoodItemFields(product)
  const nutrition = pickNutrition({
    calories: mapped.calories,
    nutrition: {
      calories: mapped.calories,
      ...(mapped.openFoodFactsData?.nutrition || {}),
    },
  })
  return {
    query,
    name: query,
    category: mapped.category?.length
      ? mapped.category
      : inferFoodCategories(query),
    calories: pickCalories({ calories: mapped.calories, nutrition }),
    nutrition,
    foodId: null,
    barcode: mapped.openFoodFactsData?.barcode || product.barcode,
    matchName: mapped.name,
    source: "openfoodfacts",
  }
}

const inferred = (query: string): FoodNameLookupResult => ({
  query,
  name: query,
  category: inferFoodCategories(query),
  foodId: null,
  source: "inferred",
})

const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index])
    }
  }

  const pool = Math.min(Math.max(1, limit), items.length)
  await Promise.all(Array.from({ length: pool }, () => worker()))
  return results
}

const lookupOpenFoodFacts = async (
  query: string
): Promise<FoodNameLookupResult | null> => {
  const product = await openFoodFactsService.findConfidentProductByName(query)
  if (!product) return null
  return fromOpenFoodFacts(query, product)
}

export const lookupFoodsByName = async (
  names: string[],
  catalog: CatalogFoodMatch[] = []
): Promise<FoodNameLookupResult[]> => {
  const catalogByKey = new Map<string, CatalogFoodMatch>()
  for (const item of catalog) {
    const key = pantryItemMergeKey(item.name)
    if (key && !catalogByKey.has(key)) catalogByKey.set(key, item)
  }

  const uniqueNames: string[] = []
  const seen = new Set<string>()
  for (const raw of names) {
    const name = String(raw || "").trim()
    if (!name || seen.has(name) || uniqueNames.length >= MAX_NAMES) continue
    seen.add(name)
    uniqueNames.push(name)
  }

  const pendingOff: string[] = []
  const byQuery = new Map<string, FoodNameLookupResult>()

  for (const name of uniqueNames) {
    const match = catalogByKey.get(pantryItemMergeKey(name))
    if (match) {
      const result = fromCatalog(name, match)
      byQuery.set(name, result)
      if (!hasMacroValues(result.nutrition)) pendingOff.push(name)
    } else {
      pendingOff.push(name)
    }
  }

  const offResults = await mapWithConcurrency(
    pendingOff,
    OFF_CONCURRENCY,
    lookupOpenFoodFacts
  )

  pendingOff.forEach((name, index) => {
    const off = offResults[index]
    const existing = byQuery.get(name)
    if (existing) {
      if (off && hasMacroValues(off.nutrition) && !hasMacroValues(existing.nutrition)) {
        byQuery.set(name, {
          ...existing,
          calories: off.calories,
          nutrition: off.nutrition,
          barcode: off.barcode,
          matchName: existing.matchName || off.matchName,
        })
      }
      return
    }
    byQuery.set(name, off || inferred(name))
  })

  return uniqueNames.map((name) => byQuery.get(name) || inferred(name))
}
