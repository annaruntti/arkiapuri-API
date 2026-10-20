import type { Model } from "mongoose"
import type { IShoppingList } from "../models/shoppingList"
import type { IUser } from "../models/user"
import { resolveModule } from "../helpers/controllerUtils"
import { getDataOwnership } from "../helpers/householdHelpers"
import { shoppingListDisplayTotal } from "./priceEstimate"
import type { ShoppingListItemInput } from "./shoppingListItemMapping"
import { prepareShoppingListItemsForAdd } from "./shoppingListItemOps"

const ShoppingList = resolveModule<Model<IShoppingList>>(
  require("../models/shoppingList")
)

export type CreateShoppingListResult =
  | { status: "ok"; shoppingList: IShoppingList }
  | { status: "bad_request"; message: string }

/**
 * Create a shopping list with mapped items and display total.
 */
export const createShoppingListForUser = async (
  user: IUser,
  body: {
    name?: string
    description?: string
    items?: ShoppingListItemInput[]
    totalEstimatedPrice?: number
  }
): Promise<CreateShoppingListResult> => {
  const { name, description, items, totalEstimatedPrice } = body

  if (!name || !Array.isArray(items)) {
    return {
      status: "bad_request",
      message: "Name and items are required",
    }
  }

  const ownership = getDataOwnership(user)
  const mappedItems = await prepareShoppingListItemsForAdd(user, items)
  const shoppingList = new ShoppingList({
    userId: ownership.userId,
    household: ownership.household,
    name,
    description,
    items: mappedItems,
    totalEstimatedPrice: shoppingListDisplayTotal(
      mappedItems,
      totalEstimatedPrice
    ),
  })

  await shoppingList.save()

  return { status: "ok", shoppingList }
}
