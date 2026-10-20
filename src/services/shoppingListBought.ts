import type { Model } from "mongoose"
import type { IShoppingList } from "../models/shoppingList"
import type { IUser } from "../models/user"
import { resolveModule } from "../helpers/controllerUtils"
import {
  FOOD_ITEM_SELECT,
  mergeFoodIdIntoItems,
  shoppingListAccessQuery,
} from "./shoppingListItemMapping"

const ShoppingList = resolveModule<Model<IShoppingList>>(
  require("../models/shoppingList")
)

export type SetItemBoughtResult =
  | {
      status: "ok"
      message: string
      shoppingList: ReturnType<typeof mergeFoodIdIntoItems> | IShoppingList
    }
  | { status: "not_found_list" | "not_found_item" | "bad_request"; message: string }

export const setShoppingListItemBoughtForUser = async (
  user: IUser,
  listId: string,
  itemId: string,
  bought: unknown
): Promise<SetItemBoughtResult> => {
  const normalizedItemId = String(itemId)

  const shoppingList = await ShoppingList.findOne(
    await shoppingListAccessQuery(user, listId)
  )

  if (!shoppingList) {
    return { status: "not_found_list", message: "Shopping list not found" }
  }

  const item = shoppingList.items.find(
    (listItem) => listItem._id?.toString() === normalizedItemId
  )

  if (!item) {
    return {
      status: "not_found_item",
      message: "Item not found in shopping list",
    }
  }

  if (typeof bought !== "boolean") {
    return { status: "bad_request", message: "bought must be a boolean" }
  }

  item.bought = bought
  shoppingList.markModified("items")
  await shoppingList.save()

  const updatedShoppingList = await ShoppingList.findOne(
    await shoppingListAccessQuery(user, listId)
  ).populate({
    path: "items.foodId",
    select: FOOD_ITEM_SELECT,
  })

  return {
    status: "ok",
    message: item.bought ? "Item marked as bought" : "Item restored to list",
    shoppingList: updatedShoppingList
      ? mergeFoodIdIntoItems(
          updatedShoppingList.toObject() as unknown as {
            items: Array<Record<string, unknown>>
          }
        )
      : shoppingList,
  }
}
