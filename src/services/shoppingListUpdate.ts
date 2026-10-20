import type { Model } from "mongoose"
import type { IShoppingList, IShoppingListItem } from "../models/shoppingList"
import type { IUser } from "../models/user"
import { resolveModule } from "../helpers/controllerUtils"
import { applyEstimatesToShoppingItems } from "./priceEstimateService"
import { positivePrice, shoppingListDisplayTotal } from "./priceEstimate"
import {
  FOOD_ITEM_SELECT,
  mapShoppingListItem,
  mergeFoodIdIntoItems,
  shoppingListAccessQuery,
  type ShoppingListItemInput,
} from "./shoppingListItemMapping"

const ShoppingList = resolveModule<Model<IShoppingList>>(
  require("../models/shoppingList")
)

export type UpdateShoppingListResult =
  | {
      status: "ok"
      shoppingList: ReturnType<typeof mergeFoodIdIntoItems>
    }
  | { status: "not_found"; message: string }

/**
 * Replace list items (optional) and refresh display total for the user.
 */
export const updateShoppingListForUser = async (
  user: IUser,
  listId: string,
  body: {
    items?: ShoppingListItemInput[]
    totalEstimatedPrice?: number
  }
): Promise<UpdateShoppingListResult> => {
  const { items, totalEstimatedPrice } = body
  const query = await shoppingListAccessQuery(user, listId)

  const existingList = await ShoppingList.findOne(query)
  if (!existingList) {
    return {
      status: "not_found",
      message: "Shopping list not found or unauthorized",
    }
  }

  if (items) {
    existingList.items = items.map(mapShoppingListItem) as IShoppingListItem[]
    await applyEstimatesToShoppingItems(user, existingList.items)
    // A duplicate collapse sends line totals already scaled to the merged
    // quantity. Keep those instead of a fresh single-package estimate.
    items.forEach((raw, index) => {
      const item = existingList.items[index]
      if (!item || positivePrice(item.price) > 0) return
      const estimate = positivePrice(raw.priceEstimate)
      if (!(estimate > 0)) return
      item.priceEstimate = estimate
      item.priceEstimateSource =
        raw.priceEstimateSource === "category" ? "category" : "history"
    })
  }

  existingList.totalEstimatedPrice = shoppingListDisplayTotal(
    existingList.items,
    totalEstimatedPrice !== undefined
      ? totalEstimatedPrice
      : existingList.totalEstimatedPrice
  )
  existingList.markModified("items")
  await existingList.save()

  const shoppingList = await ShoppingList.findOne(query).populate({
    path: "items.foodId",
    select: FOOD_ITEM_SELECT,
  })

  if (!shoppingList) {
    return {
      status: "not_found",
      message: "Shopping list not found or unauthorized",
    }
  }

  return {
    status: "ok",
    shoppingList: mergeFoodIdIntoItems(
      shoppingList.toObject() as unknown as {
        items: Array<Record<string, unknown>>
      }
    ),
  }
}
