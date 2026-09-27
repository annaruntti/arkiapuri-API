import { pantryItemMergeKey } from "../helpers/pantryHelpers"
import { findBestCatalogMatch } from "./foodNameMatch"
import { normalizeAppUnit } from "../utils/openFoodFactsMapper"
import categoryPriceBaseline from "../data/categoryPriceBaseline.json"

export type PriceEstimateSource = "history" | "category"
export type HistoryKind = "food" | "pantry" | "list"
export type FoodPriceSource = "user" | "open-prices"

export interface EstimateLineInput {
  name: string
  isFood?: boolean
  quantity?: number
  unit?: string
  category?: string[]
  price?: number
  foodId?: string
  packageQuantity?: number
  packageUnit?: string
}

export interface HistoryPrice {
  kind: HistoryKind
  foodId?: string
  name: string
  price: number
  quantity: number
  unit: string
  priceSource?: FoodPriceSource
}

export interface LinePriceEstimate {
  priceEstimate: number
  priceEstimateSource: PriceEstimateSource
  priceFromOpenPrices: boolean
}

interface PriceRate {
  name: string
  eur: number
  unit: string
  id?: number
}

const MASS_IN_GRAMS: Record<string, number> = { g: 1, kg: 1000 }
const VOLUME_IN_ML: Record<string, number> = {
  ml: 1,
  dl: 100,
  l: 1000,
  tl: 5,
  rkl: 15,
}

const KIND_ORDER: Record<HistoryKind, number> = {
  food: 0,
  pantry: 1,
  list: 2,
}

export const roundMoney = (value: number): number =>
  Math.round(value * 100) / 100

export const positivePrice = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : 0
  }
  const parsed = parseFloat(String(value ?? "").replace(",", "."))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

const quantityOf = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? ""))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export interface OpenPriceObservation {
  price: number
  priceIsDiscounted?: boolean | null
  discountType?: string | null
}

/** Median package price. Needs at least three observations; discounts are dropped when enough regular prices remain. */
export const priceFromOpenPricesObservations = (
  observations: OpenPriceObservation[]
): number | null => {
  const valid = observations.filter((row) => positivePrice(row.price) > 0)
  const regular = valid.filter(
    (row) => !row.priceIsDiscounted && !row.discountType
  )
  const pool = regular.length >= 3 ? regular : valid
  if (pool.length < 3) return null
  const sorted = pool.map((row) => row.price).sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid]
  return roundMoney(median)
}

/** Writes an Open Prices package price only when the food item has no price yet. */
export const assignOpenPricesToFoodItem = (
  food: { price?: number; priceSource?: FoodPriceSource },
  median: number | null
): boolean => {
  if (positivePrice(food.price) > 0) return false
  if (median == null || median <= 0) return false
  food.price = median
  food.priceSource = "open-prices"
  return true
}

const dimensionFactor = (
  unit: string
): { kind: "mass" | "volume" | "count"; factor: number } | null => {
  const normalized = normalizeAppUnit(unit)
  if (MASS_IN_GRAMS[normalized]) {
    return { kind: "mass", factor: MASS_IN_GRAMS[normalized] }
  }
  if (VOLUME_IN_ML[normalized]) {
    return { kind: "volume", factor: VOLUME_IN_ML[normalized] }
  }
  if (normalized === "kpl") return { kind: "count", factor: 1 }
  return null
}

/** Converts a line quantity into the baseline unit. Returns null when the units cannot be compared. */
export const convertQuantity = (
  quantity: number,
  fromUnit: string,
  toUnit: string,
  packageQuantity?: number,
  packageUnit?: string
): number | null => {
  const from = dimensionFactor(fromUnit)
  const to = dimensionFactor(toUnit)
  if (!from || !to || quantity <= 0) return null
  if (from.kind === to.kind) {
    return (quantity * from.factor) / to.factor
  }
  if (from.kind === "count" && packageQuantity && packageQuantity > 0 && packageUnit) {
    const packaged = convertQuantity(packageQuantity, packageUnit, toUnit)
    if (packaged == null) return null
    return packaged * quantity
  }
  return null
}

const foodIdOf = (value: unknown): string => {
  if (!value) return ""
  if (typeof value === "object" && value !== null && "_id" in value) {
    return String((value as { _id: unknown })._id)
  }
  return String(value)
}

const sameProduct = (item: EstimateLineInput, candidate: HistoryPrice): boolean => {
  const itemFoodId = foodIdOf(item.foodId)
  const candidateFoodId = candidate.foodId ? String(candidate.foodId) : ""
  if (itemFoodId) {
    return Boolean(candidateFoodId) && itemFoodId === candidateFoodId
  }
  const itemKey = pantryItemMergeKey(item.name)
  const candidateKey = pantryItemMergeKey(candidate.name)
  return Boolean(itemKey) && itemKey === candidateKey
}

const historyEstimate = (
  item: EstimateLineInput,
  history: HistoryPrice[]
): { amount: number; fromOpenPrices: boolean } | null => {
  const unit = normalizeAppUnit(item.unit)
  const quantity = quantityOf(item.quantity)
  const matches = history
    .filter(
      (candidate) =>
        positivePrice(candidate.price) > 0 &&
        candidate.quantity > 0 &&
        normalizeAppUnit(candidate.unit) === unit &&
        sameProduct(item, candidate)
    )
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
  const chosen = matches[0]
  if (!chosen) return null
  return {
    amount: roundMoney((chosen.price / chosen.quantity) * quantity),
    fromOpenPrices:
      chosen.kind === "food" && chosen.priceSource === "open-prices",
  }
}

const categoryRates = (): { names: PriceRate[]; categories: PriceRate[] } => ({
  names: categoryPriceBaseline.names,
  categories: categoryPriceBaseline.categories,
})

const categoryEstimate = (
  item: EstimateLineInput,
  cpiMultiplier: number
): number | null => {
  if (item.isFood === false) return null
  const { names, categories } = categoryRates()
  const named = findBestCatalogMatch(item.name, names)
  const category = (item.category || [])
    .map((entry) => String(entry))
    .map((entry) =>
      categories.find(
        (rate) =>
          String(rate.id) === entry ||
          rate.name.toLowerCase() === entry.toLowerCase()
      )
    )
    .find(Boolean)
  const rate = named || category
  if (!rate) return null
  const converted = convertQuantity(
    quantityOf(item.quantity),
    item.unit || "kpl",
    rate.unit,
    item.packageQuantity,
    item.packageUnit
  )
  if (converted == null) return null
  const multiplier =
    Number.isFinite(cpiMultiplier) && cpiMultiplier > 0 ? cpiMultiplier : 1
  const amount = roundMoney(rate.eur * converted * multiplier)
  return amount > 0 ? amount : null
}

export const estimateLinePrice = (
  item: EstimateLineInput,
  options: { history?: HistoryPrice[]; cpiMultiplier?: number } = {}
): LinePriceEstimate | null => {
  if (positivePrice(item.price) > 0) return null
  const fromHistory = historyEstimate(item, options.history || [])
  if (fromHistory && fromHistory.amount > 0) {
    return {
      priceEstimate: fromHistory.amount,
      priceEstimateSource: "history",
      priceFromOpenPrices: fromHistory.fromOpenPrices,
    }
  }
  const fromCategory = categoryEstimate(item, options.cpiMultiplier ?? 1)
  if (fromCategory == null) return null
  return {
    priceEstimate: fromCategory,
    priceEstimateSource: "category",
    priceFromOpenPrices: false,
  }
}

export const displayLineAmount = (item: {
  price?: number
  priceEstimate?: number
  estimatedPrice?: number
}): number => {
  const price = positivePrice(item.price)
  if (price > 0) return price
  const estimate = positivePrice(item.priceEstimate)
  if (estimate > 0) return estimate
  return positivePrice(item.estimatedPrice)
}

export const shoppingListDisplayTotal = (
  items: Array<{
    price?: number
    priceEstimate?: number
    estimatedPrice?: number
  }>,
  manualTotal?: number
): number => {
  const amounts = items.map(displayLineAmount)
  if (!amounts.some((amount) => amount > 0)) {
    return roundMoney(positivePrice(manualTotal))
  }
  return roundMoney(amounts.reduce((sum, amount) => sum + amount, 0))
}

export const foodIndexMultiplierFromTable = (
  table: { data?: Array<{ key?: string[]; values?: string[] }> },
  baselineMonth: string
): number | null => {
  const points = new Map<string, number>()
  for (const row of table.data || []) {
    const month = row.key?.[0]
    const value = parseFloat(String(row.values?.[0] ?? ""))
    if (month && Number.isFinite(value) && value > 0) points.set(month, value)
  }
  const baselineKey = baselineMonth.replace("-", "M")
  const baseline = points.get(baselineKey)
  const months = [...points.keys()].sort()
  const latestKey = months[months.length - 1]
  const latest = latestKey ? points.get(latestKey) : undefined
  if (!baseline || !latest) return null
  return latest / baseline
}

export const categoryBaselineMonth = categoryPriceBaseline.baselineMonth
