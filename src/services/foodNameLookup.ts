import { pantryItemMergeKey } from "../helpers/pantryHelpers"
import { inferFoodCategories } from "./ai/productNormalizer"
import type {
  CatalogFoodMatch,
  FoodMatchSource,
  FoodNutrition,
  NormalizedPantryCandidate,
} from "./ai/types"
import { findBestCatalogMatch } from "./foodNameMatch"
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
  imageUrl?: string
  matchName?: string
  source: FoodMatchSource
}

export type FoodLookupQuery =
  | string
  | {
      name: string
      barcode?: string
      brand?: string
    }

const MAX_NAMES = 50
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

const cleanBarcode = (value?: string): string =>
  String(value || "").replace(/\D/g, "")

const isPlausibleBarcode = (barcode: string): boolean =>
  barcode.length >= 8 && barcode.length <= 14

const pickImageUrl = (item?: {
  imageUrl?: string
  image?: { url?: string }
  openFoodFactsData?: { imageUrl?: string }
}): string | undefined => {
  const url =
    item?.imageUrl || item?.image?.url || item?.openFoodFactsData?.imageUrl
  return url || undefined
}

export const toCatalogFoodMatch = (item: {
  _id: unknown
  name?: string
  category?: string[]
  unit?: string
  calories?: number
  nutrition?: FoodNutrition
  image?: { url?: string }
  openFoodFactsData?: { nutrition?: FoodNutrition; imageUrl?: string; barcode?: string }
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
  imageUrl: pickImageUrl(item),
  barcode: cleanBarcode(item.openFoodFactsData?.barcode) || undefined,
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
  barcode: match.barcode,
  imageUrl: match.imageUrl,
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
    imageUrl: mapped.image?.url || mapped.openFoodFactsData?.imageUrl,
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

const mergeOffIntoCatalog = (
  catalogResult: FoodNameLookupResult,
  off: FoodNameLookupResult
): FoodNameLookupResult => ({
  ...catalogResult,
  calories: catalogResult.calories ?? off.calories,
  nutrition: hasMacroValues(catalogResult.nutrition)
    ? catalogResult.nutrition
    : off.nutrition ?? catalogResult.nutrition,
  barcode: catalogResult.barcode || off.barcode,
  imageUrl: catalogResult.imageUrl || off.imageUrl,
  matchName: catalogResult.matchName || off.matchName,
})

const needsOffEnrichment = (result: FoodNameLookupResult): boolean =>
  !hasMacroValues(result.nutrition) || !result.imageUrl

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
  query: string,
  brand?: string
): Promise<FoodNameLookupResult | null> => {
  const searches = [query]
  if (brand) {
    const branded = `${brand} ${query}`.trim()
    if (branded !== query) searches.unshift(branded)
  }

  for (const search of searches) {
    const product = await openFoodFactsService.findConfidentProductByName(search)
    if (product) return fromOpenFoodFacts(query, product)
  }
  return null
}

const lookupOpenFoodFactsByBarcode = async (
  query: string,
  barcode: string
): Promise<FoodNameLookupResult | null> => {
  if (!isPlausibleBarcode(barcode)) return null
  try {
    const product = await openFoodFactsService.searchByBarcode(barcode)
    if (!product) return null
    return fromOpenFoodFacts(query, product)
  } catch (error) {
    console.warn("OFF barcode lookup failed:", error)
    return null
  }
}

const normalizeQueries = (
  names: FoodLookupQuery[]
): Array<{ name: string; barcode?: string; brand?: string }> => {
  const unique: Array<{ name: string; barcode?: string; brand?: string }> = []
  const seen = new Set<string>()

  for (const raw of names) {
    const parsed =
      typeof raw === "string"
        ? { name: raw.trim(), barcode: undefined, brand: undefined }
        : {
            name: String(raw?.name || "").trim(),
            barcode: cleanBarcode(raw?.barcode) || undefined,
            brand: String(raw?.brand || "").trim() || undefined,
          }
    if (!parsed.name || seen.has(parsed.name) || unique.length >= MAX_NAMES) {
      continue
    }
    seen.add(parsed.name)
    unique.push(parsed)
  }

  return unique
}

const findCatalogItem = (
  query: string,
  barcode: string | undefined,
  catalogByKey: Map<string, CatalogFoodMatch>,
  catalogByBarcode: Map<string, CatalogFoodMatch>,
  catalog: CatalogFoodMatch[]
): CatalogFoodMatch | undefined => {
  if (barcode && catalogByBarcode.has(barcode)) {
    return catalogByBarcode.get(barcode)
  }
  const exact = catalogByKey.get(pantryItemMergeKey(query))
  if (exact) return exact
  return findBestCatalogMatch(query, catalog) || undefined
}

export const lookupFoodsByName = async (
  names: FoodLookupQuery[],
  catalog: CatalogFoodMatch[] = []
): Promise<FoodNameLookupResult[]> => {
  const catalogByKey = new Map<string, CatalogFoodMatch>()
  const catalogByBarcode = new Map<string, CatalogFoodMatch>()
  for (const item of catalog) {
    const key = pantryItemMergeKey(item.name)
    if (key && !catalogByKey.has(key)) catalogByKey.set(key, item)
    if (item.barcode && !catalogByBarcode.has(item.barcode)) {
      catalogByBarcode.set(item.barcode, item)
    }
  }

  const uniqueQueries = normalizeQueries(names)
  const pendingOff: Array<{
    name: string
    barcode?: string
    brand?: string
  }> = []
  const byQuery = new Map<string, FoodNameLookupResult>()

  for (const query of uniqueQueries) {
    const match = findCatalogItem(
      query.name,
      query.barcode,
      catalogByKey,
      catalogByBarcode,
      catalog
    )
    if (match) {
      const result = fromCatalog(query.name, match)
      byQuery.set(query.name, result)
      if (needsOffEnrichment(result)) pendingOff.push(query)
    } else {
      pendingOff.push(query)
    }
  }

  const offResults = await mapWithConcurrency(
    pendingOff,
    OFF_CONCURRENCY,
    async (query) => {
      if (query.barcode) {
        const byBarcode = await lookupOpenFoodFactsByBarcode(
          query.name,
          query.barcode
        )
        if (byBarcode) return byBarcode
      }
      return lookupOpenFoodFacts(query.name, query.brand)
    }
  )

  pendingOff.forEach((query, index) => {
    const off = offResults[index]
    const existing = byQuery.get(query.name)
    if (existing) {
      if (off) byQuery.set(query.name, mergeOffIntoCatalog(existing, off))
      return
    }
    byQuery.set(query.name, off || inferred(query.name))
  })

  return uniqueQueries.map(
    (query) => byQuery.get(query.name) || inferred(query.name)
  )
}

const applyLookupToCandidate = (
  item: NormalizedPantryCandidate,
  result?: FoodNameLookupResult
): NormalizedPantryCandidate => {
  if (!result) {
    return {
      ...item,
      matchSource: item.matchSource || "inferred",
    }
  }

  const fromCatalog = result.source === "catalog"
  const catalogName = result.matchName || result.name
  const sameProduct =
    fromCatalog &&
    Boolean(
      pantryItemMergeKey(item.name) &&
        pantryItemMergeKey(catalogName) &&
        pantryItemMergeKey(item.name) === pantryItemMergeKey(catalogName)
    )

  return {
    ...item,
    // Keep the scanned/typed name when the catalog hit is a different product
    // (e.g. "kivennäisvesi" must not become "Novelle kivennäisvesi").
    name: sameProduct && result.name ? result.name : item.name,
    foodId: sameProduct ? result.foodId || item.foodId : null,
    category: result.category?.length ? result.category : item.category,
    calories: result.calories ?? item.calories,
    nutrition: result.nutrition ?? item.nutrition,
    matchSource: sameProduct
      ? result.source
      : fromCatalog
        ? item.matchSource || "inferred"
        : result.source,
    matchName: sameProduct
      ? catalogName
      : result.source === "openfoodfacts"
        ? result.matchName || item.matchName
        : item.matchName,
    barcode: result.barcode || item.barcode,
    imageUrl: result.imageUrl || item.imageUrl,
  }
}

export const enrichPantryCandidates = async (
  items: NormalizedPantryCandidate[],
  catalog: CatalogFoodMatch[] = []
): Promise<NormalizedPantryCandidate[]> => {
  if (!items.length) return items

  const results = await lookupFoodsByName(
    items.map((item) => ({
      name: item.originalName || item.name,
      barcode: item.barcode,
      brand: item.brand,
    })),
    catalog
  )

  const byQuery = new Map(
    results.map((result) => [result.query.trim().toLowerCase(), result])
  )

  return items.map((item) => {
    const query = (item.originalName || item.name).trim().toLowerCase()
    return applyLookupToCandidate(item, byQuery.get(query))
  })
}
