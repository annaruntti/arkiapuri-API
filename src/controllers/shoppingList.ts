import { Response } from "express"
import type { Model } from "mongoose"
import type { IFoodItem } from "../models/foodItem"
import type { IShoppingList } from "../models/shoppingList"
import {
  AuthenticatedRequest,
  getErrorMessage,
  resolveModule,
} from "../helpers/controllerUtils"
import {
  getDataOwnership,
  getDataQuery,
} from "../helpers/householdHelpers"
import { estimateShoppingListItems } from "../services/priceEstimateService"
import {
  positivePrice,
  shoppingListDisplayTotal,
} from "../services/priceEstimate"
import { moveShoppingListItemsToPantry } from "../services/moveShoppingListToPantry"
import {
  FOOD_ITEM_SELECT,
  mergeFoodIdIntoItems,
  shoppingListAccessQuery,
  type ShoppingListItemInput,
} from "../services/shoppingListItemMapping"
import { prepareShoppingListItemsForAdd } from "../services/shoppingListItemOps"
import { setShoppingListItemBoughtForUser } from "../services/shoppingListBought"
import {
  deleteShoppingListItemForUser,
  updateShoppingListItemForUser,
} from "../services/shoppingListItemMutations"
import { updateShoppingListForUser } from "../services/shoppingListUpdate"
import { addItemsToShoppingListForUser } from "../services/shoppingListAddItems"

const ShoppingList = resolveModule<Model<IShoppingList>>(
  require("../models/shoppingList")
)
const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))

interface CreateShoppingListBody {
  name: string
  description?: string
  items: ShoppingListItemInput[]
  totalEstimatedPrice?: number
}

export const createShoppingList = async (
  req: AuthenticatedRequest<
    Record<string, string>,
    unknown,
    CreateShoppingListBody
  >,
  res: Response
) => {
  try {
    const { name, description, items, totalEstimatedPrice } = req.body

    if (!name || !Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: "Name and items are required",
      })
    }

    const ownership = getDataOwnership(req.user)
    const mappedItems = await prepareShoppingListItemsForAdd(req.user, items)
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

    res.json({ success: true, shoppingList })
  } catch (error: unknown) {
    console.error("Error creating shopping list:", error)
    res.status(400).json({ success: false, error: getErrorMessage(error) })
  }
}

export const getShoppingLists = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const query = await getDataQuery(req.user)
    const shoppingLists = await ShoppingList.find(query)
      .populate({
        path: "items.foodId",
        select: FOOD_ITEM_SELECT,
      })
      .sort({ createdAt: -1 })

    const processedLists = shoppingLists.map((list) =>
      mergeFoodIdIntoItems(
        list.toObject() as unknown as { items: Array<Record<string, unknown>> }
      )
    )

    res.json({ success: true, shoppingLists: processedLists })
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const updateShoppingList = async (
  req: AuthenticatedRequest<
    { id: string },
    unknown,
    { items?: ShoppingListItemInput[]; totalEstimatedPrice?: number }
  >,
  res: Response
) => {
  try {
    const result = await updateShoppingListForUser(
      req.user,
      req.params.id,
      req.body
    )
    if (result.status !== "ok") {
      return res.status(404).json({
        success: false,
        message: result.message,
      })
    }
    res.json({
      success: true,
      shoppingList: result.shoppingList,
    })
  } catch (error: unknown) {
    res.status(400).json({ success: false, error: getErrorMessage(error) })
  }
}

export const setItemBought = async (
  req: AuthenticatedRequest<
    { listId: string; itemId: string },
    unknown,
    { bought?: boolean }
  >,
  res: Response
) => {
  try {
    const result = await setShoppingListItemBoughtForUser(
      req.user,
      req.params.listId,
      req.params.itemId,
      req.body?.bought
    )

    if (result.status !== "ok") {
      const statusCode = result.status === "bad_request" ? 400 : 404
      return res.status(statusCode).json({
        success: false,
        message: result.message,
      })
    }

    res.json({
      success: true,
      message: result.message,
      shoppingList: result.shoppingList,
    })
  } catch (error: unknown) {
    console.error("Error in setItemBought:", error)
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    })
  }
}

export const moveItemToPantry = async (
  req: AuthenticatedRequest<{ listId: string; itemId: string }>,
  res: Response
) => {
  try {
    const { listId, itemId } = req.params
    const result = await moveShoppingListItemsToPantry(
      req.user,
      listId,
      [String(itemId)]
    )

    if (result.status === "not_found_list") {
      return res.status(404).json({
        success: false,
        message: "Shopping list not found",
      })
    }

    if (result.moved.length === 0 && result.notFound.length > 0) {
      return res.status(404).json({
        success: false,
        message: "Item not found in shopping list",
      })
    }

    if (result.moved.length === 0 && result.skippedNonFood.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Non-food items cannot be moved to pantry",
      })
    }

    res.json({
      success: true,
      message: "Item moved to pantry",
      shoppingList: result.shoppingList,
      moved: result.moved,
      skippedNonFood: result.skippedNonFood,
    })
  } catch (error: unknown) {
    console.error("Error in moveItemToPantry:", error)
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    })
  }
}

export const moveItemsToPantry = async (
  req: AuthenticatedRequest<
    { listId: string },
    unknown,
    { itemIds?: string[] }
  >,
  res: Response
) => {
  try {
    const { listId } = req.params
    const itemIds = Array.isArray(req.body?.itemIds)
      ? req.body.itemIds.map(String).filter(Boolean)
      : []

    if (itemIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "itemIds must be a non-empty array",
      })
    }

    const result = await moveShoppingListItemsToPantry(
      req.user,
      listId,
      itemIds
    )

    if (result.status === "not_found_list") {
      return res.status(404).json({
        success: false,
        message: "Shopping list not found",
      })
    }

    res.json({
      success: true,
      message:
        result.moved.length > 0
          ? `${result.moved.length} item(s) moved to pantry`
          : "No items moved to pantry",
      shoppingList: result.shoppingList,
      moved: result.moved,
      skippedNonFood: result.skippedNonFood,
      removedNonFood: result.removedNonFood ?? result.skippedNonFood,
      notFound: result.notFound,
    })
  } catch (error: unknown) {
    console.error("Error in moveItemsToPantry:", error)
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    })
  }
}

export const deleteShoppingListItem = async (
  req: AuthenticatedRequest<{ listId: string; itemId: string }>,
  res: Response
) => {
  try {
    const result = await deleteShoppingListItemForUser(
      req.user,
      req.params.listId,
      req.params.itemId
    )
    if (result.status !== "ok") {
      return res.status(404).json({
        success: false,
        message: result.message,
      })
    }
    res.json({
      success: true,
      message: result.message,
      shoppingList: result.shoppingList,
    })
  } catch (error: unknown) {
    console.error("Error in deleteShoppingListItem:", error)
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    })
  }
}

export const updateShoppingListItem = async (
  req: AuthenticatedRequest<
    { listId: string; itemId: string },
    unknown,
    ShoppingListItemInput
  >,
  res: Response
) => {
  try {
    const result = await updateShoppingListItemForUser(
      req.user,
      req.params.listId,
      req.params.itemId,
      req.body
    )
    if (result.status !== "ok") {
      return res.status(404).json({
        success: false,
        message: result.message,
      })
    }
    res.json({
      success: true,
      shoppingList: result.shoppingList,
    })
  } catch (error: unknown) {
    res.status(400).json({ success: false, error: getErrorMessage(error) })
  }
}

export const addItemsToShoppingList = async (
  req: AuthenticatedRequest<
    { id: string },
    unknown,
    { items?: ShoppingListItemInput[] }
  >,
  res: Response
) => {
  try {
    const result = await addItemsToShoppingListForUser(
      req.user,
      req.params.id,
      req.body.items
    )
    if (result.status === "bad_request") {
      return res.status(400).json({
        success: false,
        message: result.message,
      })
    }
    if (result.status !== "ok") {
      return res.status(404).json({
        success: false,
        message: result.message,
      })
    }
    res.json({
      success: true,
      shoppingList: result.shoppingList,
    })
  } catch (error: unknown) {
    console.error("Error in addItemsToShoppingList:", error)
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    })
  }
}

export const deleteShoppingList = async (
  req: AuthenticatedRequest<{ id: string }>,
  res: Response
) => {
  try {
    const { id } = req.params

    const shoppingList = await ShoppingList.findOneAndDelete(
      await shoppingListAccessQuery(req.user, id)
    )

    if (!shoppingList) {
      return res.status(404).json({
        success: false,
        message: "Shopping list not found or unauthorized",
      })
    }

    res.json({ success: true, message: "Shopping list deleted successfully" })
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const previewShoppingListPrices = async (
  req: AuthenticatedRequest<
    Record<string, string>,
    unknown,
    { items?: ShoppingListItemInput[] }
  >,
  res: Response
) => {
  try {
    const items = req.body?.items
    if (!Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: "Items are required",
      })
    }

    const estimated = await estimateShoppingListItems(req.user, items)
    res.json({
      success: true,
      items: estimated.map((item) => ({
        name: item.name,
        price: positivePrice(item.price),
        priceEstimate: item.priceEstimate,
        priceEstimateSource: item.priceEstimateSource,
        priceFromOpenPrices: item.priceFromOpenPrices || false,
      })),
    })
  } catch (error: unknown) {
    console.error("Error in previewShoppingListPrices:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}
