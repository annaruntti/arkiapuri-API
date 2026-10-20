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
import {
  applyShoppingListItemUpdates,
  findShoppingListItemByRowId,
  findShoppingListItemIndex,
} from "./shoppingListItemOps"

const ShoppingList = resolveModule<Model<IShoppingList>>(
  require("../models/shoppingList")
)

export type ShoppingListItemMutationResult =
  | {
      status: "ok"
      message?: string
      shoppingList: ReturnType<typeof mergeFoodIdIntoItems> | IShoppingList
    }
  | { status: "not_found_list" | "not_found_item"; message: string }

const populateMergedList = async (user: IUser, listId: string, fallback: IShoppingList) => {
  const updatedShoppingList = await ShoppingList.findOne(
    await shoppingListAccessQuery(user, listId)
  ).populate({
    path: "items.foodId",
    select: FOOD_ITEM_SELECT,
  })

  return updatedShoppingList
    ? mergeFoodIdIntoItems(
        updatedShoppingList.toObject() as unknown as {
          items: Array<Record<string, unknown>>
        }
      )
    : fallback
}

export const deleteShoppingListItemForUser = async (
  user: IUser,
  listId: string,
  itemId: string
): Promise<ShoppingListItemMutationResult> => {
  const shoppingList = await ShoppingList.findOne(
    await shoppingListAccessQuery(user, listId)
  )

  if (!shoppingList) {
    return { status: "not_found_list", message: "Shopping list not found" }
  }

  const itemIndex = findShoppingListItemIndex(shoppingList.items, String(itemId))
  if (itemIndex < 0) {
    return {
      status: "not_found_item",
      message: "Item not found in shopping list",
    }
  }

  shoppingList.items.splice(itemIndex, 1)
  shoppingList.totalEstimatedPrice = shoppingListDisplayTotal(shoppingList.items)
  shoppingList.markModified("items")
  await shoppingList.save()

  return {
    status: "ok",
    message: "Item removed from shopping list",
    shoppingList: await populateMergedList(user, listId, shoppingList),
  }
}

export const updateShoppingListItemForUser = async (
  user: IUser,
  listId: string,
  itemId: string,
  updates: ShoppingListItemInput
): Promise<ShoppingListItemMutationResult> => {
  const shoppingList = await ShoppingList.findOne(
    await shoppingListAccessQuery(user, listId)
  )

  if (!shoppingList) {
    return { status: "not_found_list", message: "Shopping list not found" }
  }

  const item = findShoppingListItemByRowId(shoppingList.items, String(itemId))
  if (!item) {
    return {
      status: "not_found_item",
      message: "Item not found in shopping list",
    }
  }

  await applyShoppingListItemUpdates(user, item, updates)

  shoppingList.totalEstimatedPrice = shoppingListDisplayTotal(shoppingList.items)
  shoppingList.markModified("items")
  await shoppingList.save()

  return {
    status: "ok",
    shoppingList: await populateMergedList(user, listId, shoppingList),
  }
}
