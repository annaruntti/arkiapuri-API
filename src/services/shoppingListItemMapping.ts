import type { IShoppingListItem } from "../models/shoppingList"
import {
  AuthenticatedRequest,
  parseQuantity,
} from "../helpers/controllerUtils"
import { getDataQuery } from "../helpers/householdHelpers"
import { normalizeAppUnit } from "../utils/openFoodFactsMapper"
import { positivePrice } from "./priceEstimate"

export const shoppingListAccessQuery = async (
  user: AuthenticatedRequest["user"],
  listId: string
) => ({
  $and: [{ _id: listId }, await getDataQuery(user)],
})

export const FOOD_ITEM_SELECT =
  "name category unit packageQuantity calories price priceSource image openFoodFactsData isFood"

export interface ShoppingListItemInput {
  _id?: string
  foodId?: string
  name: string
  isFood?: boolean
  estimatedPrice?: number
  quantity?: number | string
  unit?: string
  category?: string[]
  categories?: string[]
  calories?: number
  price?: number
  priceEstimate?: number
  priceEstimateSource?: "history" | "category"
  location?: string
  bought?: boolean
}

export const resolveIsFood = (value: unknown, fallback = true): boolean => {
  if (value === false || value === "false") return false
  if (value === true || value === "true") return true
  return fallback
}

export const resolveItemFoodId = (
  foodId: unknown
): IShoppingListItem["foodId"] | undefined => {
  if (!foodId) return undefined
  if (typeof foodId === "object" && foodId !== null && "_id" in foodId) {
    return (foodId as { _id: unknown })._id as IShoppingListItem["foodId"]
  }
  return foodId as IShoppingListItem["foodId"]
}

export const mapShoppingListItem = (
  item: ShoppingListItemInput
): Partial<IShoppingListItem> => {
  const parsedQuantity = parseQuantity(item.quantity)
  const foodId = resolveItemFoodId(item.foodId)
  const isFood = resolveIsFood(item.isFood, true)

  return {
    ...(item._id ? { _id: item._id } : {}),
    ...(foodId ? { foodId } : {}),
    name: item.name,
    isFood,
    estimatedPrice: item.estimatedPrice,
    quantity: parsedQuantity,
    unit: normalizeAppUnit(item.unit),
    category: isFood ? item.category || item.categories || [] : [],
    calories: isFood ? item.calories || 0 : 0,
    price: positivePrice(item.price),
    ...(positivePrice(item.priceEstimate) > 0
      ? {
          priceEstimate: positivePrice(item.priceEstimate),
          priceEstimateSource:
            item.priceEstimateSource === "category" ? "category" : "history",
        }
      : {}),
    bought: item.bought !== undefined ? Boolean(item.bought) : false,
  } as unknown as Partial<IShoppingListItem>
}

export const mergeFoodIdIntoItems = (list: {
  items: Array<Record<string, unknown>>
}) => {
  list.items = list.items.map((item) => {
    if (item.foodId && typeof item.foodId === "object") {
      const foodId = item.foodId as {
        image?: { url?: string }
        category?: string[]
        isFood?: boolean
        openFoodFactsData?: { imageUrl?: string }
      }
      const image =
        foodId.image ||
        (foodId.openFoodFactsData?.imageUrl
          ? { url: foodId.openFoodFactsData.imageUrl }
          : item.image)
      return {
        ...item,
        image,
        category: item.category || foodId.category,
        isFood:
          item.isFood !== undefined
            ? item.isFood
            : foodId.isFood !== undefined
              ? foodId.isFood
              : true,
      }
    }
    return item
  })
  return list
}

export const normalizeDocId = (value: unknown): string => {
  if (value == null) return ""
  if (typeof value === "object") {
    const asRecord = value as {
      _id?: unknown
      id?: unknown
      $oid?: unknown
      toHexString?: () => string
      toString?: () => string
    }
    if (asRecord.$oid != null) return String(asRecord.$oid)
    if (typeof asRecord.toHexString === "function") {
      return asRecord.toHexString()
    }
    if (asRecord._id != null) return normalizeDocId(asRecord._id)
    if (asRecord.id != null) return normalizeDocId(asRecord.id)
    if (typeof asRecord.toString === "function") {
      const asString = asRecord.toString()
      if (asString && asString !== "[object Object]") return asString
    }
    return ""
  }
  return String(value).trim()
}
