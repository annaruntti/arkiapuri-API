import type { IFoodItem, FoodLocation } from "../models/foodItem"

export const FOOD_LOCATIONS: FoodLocation[] = ["meal", "shopping-list", "pantry"]

export const EMPTY_QUANTITIES: IFoodItem["quantities"] = {
  meal: 0,
  "shopping-list": 0,
  pantry: 0,
}

export const CATALOG_UPDATE_KEYS = [
  "name",
  "isFood",
  "category",
  "unit",
  "packageQuantity",
  "price",
  "calories",
  "nutrition",
  "expirationDate",
  "expireDay",
  "image",
  "openFoodFactsData",
] as const

export const resolveIsFood = (value: unknown, fallback = true): boolean => {
  if (value === false || value === "false") return false
  if (value === true || value === "true") return true
  return fallback
}

export const sanitizeFoodFields = <
  T extends {
    isFood?: boolean
    category?: string[]
    calories?: number
    nutrition?: IFoodItem["nutrition"]
    expirationDate?: string | Date | null
  },
>(
  fields: T,
  isFood: boolean
): T => {
  if (isFood) return fields
  return {
    ...fields,
    category: [],
    calories: 0,
    nutrition: undefined,
    expirationDate: undefined,
  }
}

export const normalizeNutrition = (
  nutrition: IFoodItem["nutrition"] | undefined,
  calories?: number
): { calories?: number; nutrition?: IFoodItem["nutrition"] } => {
  if (!nutrition && (calories === undefined || calories === null)) {
    return { calories }
  }

  const normalized: IFoodItem["nutrition"] = {
    ...(nutrition || {}),
  }
  const resolvedCalories =
    calories !== undefined && calories !== null
      ? Number(calories) || 0
      : normalized.calories !== undefined
        ? Number(normalized.calories) || 0
        : undefined

  if (resolvedCalories !== undefined) {
    normalized.calories = resolvedCalories
  }

  const hasAnyValue = Object.values(normalized).some(
    (value) => typeof value === "number" && !Number.isNaN(value)
  )

  return {
    calories: resolvedCalories,
    nutrition: hasAnyValue ? normalized : undefined,
  }
}

export const getPopulatedFoodName = (foodId: unknown): string | null => {
  if (!foodId || typeof foodId !== "object" || !("name" in foodId)) {
    return null
  }
  const name = (foodId as { name?: unknown }).name
  return typeof name === "string" ? name : null
}

export const resolveLocatedFoodId = (foodId: unknown): string => {
  if (!foodId) return ""
  if (typeof foodId === "object" && foodId !== null && "_id" in foodId) {
    return String((foodId as { _id: unknown })._id)
  }
  return String(foodId)
}

export const normalizeFoodItemName = (str: string): string =>
  str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
