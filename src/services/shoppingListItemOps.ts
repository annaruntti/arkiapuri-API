import type { IShoppingListItem } from "../models/shoppingList"
import type { AuthenticatedRequest } from "../helpers/controllerUtils"
import { parseQuantity } from "../helpers/controllerUtils"
import {
  applyEstimatesToShoppingItems,
  rememberUserPriceOnFoodItem,
} from "./priceEstimateService"
import { positivePrice } from "./priceEstimate"
import {
  mapShoppingListItem,
  normalizeDocId,
  resolveIsFood,
  resolveItemFoodId,
  type ShoppingListItemInput,
} from "./shoppingListItemMapping"

export const findShoppingListItemIndex = (
  items: IShoppingListItem[],
  itemId: string
): number => {
  const normalizedItemId = String(itemId)
  return items.findIndex((listItem) => {
    const rowId = listItem._id?.toString?.() || String(listItem._id || "")
    if (rowId && rowId === normalizedItemId) return true
    const foodId =
      listItem.foodId &&
      typeof listItem.foodId === "object" &&
      "_id" in listItem.foodId
        ? String((listItem.foodId as { _id: unknown })._id)
        : listItem.foodId
          ? String(listItem.foodId)
          : ""
    return Boolean(foodId) && foodId === normalizedItemId
  })
}

export const findShoppingListItemByRowId = (
  items: IShoppingListItem[],
  itemId: string
): IShoppingListItem | undefined => {
  const normalizedItemId = String(itemId)
  return items.find(
    (listItem) =>
      normalizeDocId(listItem._id) === normalizedItemId ||
      listItem._id?.toString() === normalizedItemId
  )
}

export const applyShoppingListItemUpdates = async (
  user: AuthenticatedRequest["user"],
  item: IShoppingListItem,
  updates: ShoppingListItemInput
): Promise<void> => {
  if (updates.name !== undefined) item.name = updates.name
  if (updates.quantity !== undefined) {
    item.quantity = parseQuantity(updates.quantity)
  }
  if (updates.unit !== undefined) item.unit = updates.unit
  if (updates.category !== undefined || updates.categories !== undefined) {
    item.category = updates.category || updates.categories || []
  }
  if (updates.calories !== undefined) item.calories = updates.calories
  if (updates.price !== undefined) item.price = positivePrice(updates.price)
  if (updates.estimatedPrice !== undefined) {
    item.estimatedPrice = updates.estimatedPrice
  }
  if (updates.isFood !== undefined) {
    item.isFood = resolveIsFood(updates.isFood, true)
    if (!item.isFood) {
      item.category = []
      item.calories = 0
    }
  }
  if (updates.bought !== undefined) {
    item.bought = Boolean(updates.bought)
  }
  const resolvedFoodId = resolveItemFoodId(updates.foodId)
  if (resolvedFoodId) {
    item.foodId = resolvedFoodId
  }

  const userPrice = positivePrice(item.price)
  const shouldEstimate =
    !userPrice &&
    (updates.price !== undefined ||
      updates.quantity !== undefined ||
      updates.unit !== undefined ||
      updates.name !== undefined ||
      updates.category !== undefined ||
      updates.categories !== undefined ||
      updates.isFood !== undefined ||
      !(positivePrice(item.priceEstimate) > 0))

  if (userPrice > 0) {
    item.priceEstimate = undefined
    item.priceEstimateSource = undefined
    if (updates.price !== undefined) {
      await rememberUserPriceOnFoodItem(item.foodId, userPrice, {
        quantity: item.quantity,
        unit: item.unit,
      })
    }
  } else if (shouldEstimate) {
    const clientEstimate = positivePrice(updates.priceEstimate)
    if (clientEstimate > 0) {
      item.priceEstimate = clientEstimate
      item.priceEstimateSource =
        updates.priceEstimateSource === "category" ? "category" : "history"
    } else {
      item.priceEstimate = undefined
      item.priceEstimateSource = undefined
    }
    await applyEstimatesToShoppingItems(user, [item])
  } else if (updates.priceEstimate !== undefined) {
    const estimate = positivePrice(updates.priceEstimate)
    item.priceEstimate = estimate > 0 ? estimate : undefined
    item.priceEstimateSource =
      estimate > 0
        ? updates.priceEstimateSource === "category"
          ? "category"
          : "history"
        : undefined
  }
}

/**
 * Map raw client items, seed/refresh estimates, and remember user prices.
 */
export const prepareShoppingListItemsForAdd = async (
  user: AuthenticatedRequest["user"],
  items: ShoppingListItemInput[]
): Promise<IShoppingListItem[]> => {
  const mappedItems = items.map((item) => {
    const { _id: _ignoredId, ...rest } = (item || {}) as ShoppingListItemInput & {
      _id?: unknown
    }
    return mapShoppingListItem(rest) as IShoppingListItem
  })

  items.forEach((raw, index) => {
    const estimate = positivePrice(raw.priceEstimate)
    if (!(estimate > 0) || positivePrice(mappedItems[index]?.price) > 0) {
      return
    }
    mappedItems[index].priceEstimate = estimate
    mappedItems[index].priceEstimateSource =
      raw.priceEstimateSource === "category" ? "category" : "history"
  })

  await applyEstimatesToShoppingItems(user, mappedItems)

  items.forEach((raw, index) => {
    const item = mappedItems[index]
    if (!item || positivePrice(item.price) > 0) return
    if (positivePrice(item.priceEstimate) > 0) return
    const estimate = positivePrice(raw.priceEstimate)
    if (!(estimate > 0)) return
    item.priceEstimate = estimate
    item.priceEstimateSource =
      raw.priceEstimateSource === "category" ? "category" : "history"
  })

  await Promise.all(
    mappedItems.map(async (item) => {
      const userPrice = positivePrice(item.price)
      if (userPrice > 0 && item.foodId) {
        await rememberUserPriceOnFoodItem(item.foodId, userPrice, {
          quantity: item.quantity,
          unit: item.unit,
        })
      }
    })
  )

  return mappedItems
}
