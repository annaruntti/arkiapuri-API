import { Response } from "express"
import type { Model } from "mongoose"
import type { IFoodItem } from "../models/foodItem"
import type { IShoppingList, IShoppingListItem } from "../models/shoppingList"
import {
  AuthenticatedRequest,
  getErrorMessage,
  resolveModule,
} from "../helpers/controllerUtils"
import {
  getDataOwnership,
  getDataQuery,
} from "../helpers/householdHelpers"
import {
  applyEstimatesToShoppingItems,
  estimateShoppingListItems,
} from "../services/priceEstimateService"
import {
  positivePrice,
  shoppingListDisplayTotal,
} from "../services/priceEstimate"
import { moveShoppingListItemsToPantry } from "../services/moveShoppingListToPantry"
import {
  FOOD_ITEM_SELECT,
  mapShoppingListItem,
  mergeFoodIdIntoItems,
  shoppingListAccessQuery,
  type ShoppingListItemInput,
} from "../services/shoppingListItemMapping"
import {
  applyShoppingListItemUpdates,
  findShoppingListItemByRowId,
  findShoppingListItemIndex,
  prepareShoppingListItemsForAdd,
} from "../services/shoppingListItemOps"
import { setShoppingListItemBoughtForUser } from "../services/shoppingListBought"

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
    const { id } = req.params
    const { items, totalEstimatedPrice } = req.body
    const query = await shoppingListAccessQuery(req.user, id)

    const existingList = await ShoppingList.findOne(query)
    if (!existingList) {
      return res.status(404).json({
        success: false,
        message: "Shopping list not found or unauthorized",
      })
    }

    if (items) {
      existingList.items = items.map(mapShoppingListItem) as IShoppingListItem[]
      await applyEstimatesToShoppingItems(req.user, existingList.items)
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
      return res.status(404).json({
        success: false,
        message: "Shopping list not found or unauthorized",
      })
    }

    res.json({
      success: true,
      shoppingList: mergeFoodIdIntoItems(
        shoppingList.toObject() as unknown as {
          items: Array<Record<string, unknown>>
        }
      ),
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
    const { listId, itemId } = req.params
    const normalizedItemId = String(itemId)

    const shoppingList = await ShoppingList.findOne(
      await shoppingListAccessQuery(req.user, listId)
    )

    if (!shoppingList) {
      return res.status(404).json({
        success: false,
        message: "Shopping list not found",
      })
    }

    const itemIndex = findShoppingListItemIndex(
      shoppingList.items,
      normalizedItemId
    )

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Item not found in shopping list",
      })
    }

    const item = shoppingList.items[itemIndex]

    shoppingList.items.splice(itemIndex, 1)
    shoppingList.totalEstimatedPrice = shoppingListDisplayTotal(
      shoppingList.items
    )
    shoppingList.markModified("items")
    await shoppingList.save()

    const updatedShoppingList = await ShoppingList.findOne(
      await shoppingListAccessQuery(req.user, listId)
    ).populate({
      path: "items.foodId",
      select: FOOD_ITEM_SELECT,
    })

    res.json({
      success: true,
      message: "Item removed from shopping list",
      shoppingList: updatedShoppingList
        ? mergeFoodIdIntoItems(
            updatedShoppingList.toObject() as unknown as {
              items: Array<Record<string, unknown>>
            }
          )
        : shoppingList,
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
    const { listId, itemId } = req.params
    const updates = req.body
    const normalizedItemId = String(itemId)

    const shoppingList = await ShoppingList.findOne(
      await shoppingListAccessQuery(req.user, listId)
    )

    if (!shoppingList) {
      return res.status(404).json({
        success: false,
        message: "Shopping list not found",
      })
    }

    const item = findShoppingListItemByRowId(
      shoppingList.items,
      normalizedItemId
    )

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found in shopping list",
      })
    }

    await applyShoppingListItemUpdates(req.user, item, updates)

    shoppingList.totalEstimatedPrice = shoppingListDisplayTotal(
      shoppingList.items
    )
    shoppingList.markModified("items")

    await shoppingList.save()

    const updatedShoppingList = await ShoppingList.findOne(
      await shoppingListAccessQuery(req.user, listId)
    ).populate({
      path: "items.foodId",
      select: FOOD_ITEM_SELECT,
    })

    res.json({
      success: true,
      shoppingList: updatedShoppingList
        ? mergeFoodIdIntoItems(
            updatedShoppingList.toObject() as unknown as {
              items: Array<Record<string, unknown>>
            }
          )
        : shoppingList,
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
    const { id } = req.params
    const { items } = req.body

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Items are required",
      })
    }

    const shoppingList = await ShoppingList.findOne(
      await shoppingListAccessQuery(req.user, id)
    )

    if (!shoppingList) {
      return res.status(404).json({
        success: false,
        message: "Shopping list not found or unauthorized",
      })
    }

    // Ignore client-provided row ids on create — barcode flow may send a
    // FoodItem id as _id, which breaks later delete/update by row id.
    const mappedItems = await prepareShoppingListItemsForAdd(req.user, items)
    shoppingList.items.push(...mappedItems)

    shoppingList.totalEstimatedPrice = shoppingListDisplayTotal(
      shoppingList.items
    )

    await shoppingList.save()

    const updatedShoppingList = await ShoppingList.findOne(
      await shoppingListAccessQuery(req.user, id)
    ).populate({
      path: "items.foodId",
      select: FOOD_ITEM_SELECT,
    })

    res.json({
      success: true,
      shoppingList: updatedShoppingList
        ? mergeFoodIdIntoItems(
            updatedShoppingList.toObject() as unknown as {
              items: Array<Record<string, unknown>>
            }
          )
        : shoppingList,
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
