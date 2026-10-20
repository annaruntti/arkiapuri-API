import type { Model } from "mongoose"
import type { IShoppingList } from "../models/shoppingList"
import type { IUser } from "../models/user"
import { resolveModule } from "../helpers/controllerUtils"
import { shoppingListDisplayTotal } from "./priceEstimate"
import {
  FOOD_ITEM_SELECT,
  mergeFoodIdIntoItems,
  shoppingListAccessQuery,
  type ShoppingListItemInput,
} from "./shoppingListItemMapping"
import { prepareShoppingListItemsForAdd } from "./shoppingListItemOps"

const ShoppingList = resolveModule<Model<IShoppingList>>(
  require("../models/shoppingList")
)

export type AddItemsToShoppingListResult =
  | {
      status: "ok"
      shoppingList: ReturnType<typeof mergeFoodIdIntoItems> | IShoppingList
    }
  | { status: "bad_request" | "not_found"; message: string }

/**
 * Append mapped items to a shopping list and refresh display total.
 */
export const addItemsToShoppingListForUser = async (
  user: IUser,
  listId: string,
  items: ShoppingListItemInput[] | undefined
): Promise<AddItemsToShoppingListResult> => {
  if (!Array.isArray(items) || items.length === 0) {
    return { status: "bad_request", message: "Items are required" }
  }

  const shoppingList = await ShoppingList.findOne(
    await shoppingListAccessQuery(user, listId)
  )

  if (!shoppingList) {
    return {
      status: "not_found",
      message: "Shopping list not found or unauthorized",
    }
  }

  // Ignore client-provided row ids on create — barcode flow may send a
  // FoodItem id as _id, which breaks later delete/update by row id.
  const mappedItems = await prepareShoppingListItemsForAdd(user, items)
  shoppingList.items.push(...mappedItems)

  shoppingList.totalEstimatedPrice = shoppingListDisplayTotal(shoppingList.items)

  await shoppingList.save()

  const updatedShoppingList = await ShoppingList.findOne(
    await shoppingListAccessQuery(user, listId)
  ).populate({
    path: "items.foodId",
    select: FOOD_ITEM_SELECT,
  })

  return {
    status: "ok",
    shoppingList: updatedShoppingList
      ? mergeFoodIdIntoItems(
          updatedShoppingList.toObject() as unknown as {
            items: Array<Record<string, unknown>>
          }
        )
      : shoppingList,
  }
}
