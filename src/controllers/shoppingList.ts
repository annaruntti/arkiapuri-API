import { Response } from "express"
import type { Model } from "mongoose"
import type { IPantryItem } from "../models/pantry"
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
import { getCanonicalPantry } from "../helpers/pantryHelpers"

const ShoppingList = resolveModule<Model<IShoppingList>>(
  require("../models/shoppingList")
)

interface ShoppingListItemInput {
  _id?: string
  foodId?: string
  name: string
  estimatedPrice?: number
  quantity?: number | string
  unit?: string
  category?: string[]
  categories?: string[]
  calories?: number
  price?: number
  location?: string
}

interface CreateShoppingListBody {
  name: string
  description?: string
  items: ShoppingListItemInput[]
  totalEstimatedPrice?: number
}

const FOOD_ITEM_SELECT =
  "name category unit calories price image openFoodFactsData"

const parseQuantity = (value: number | string | undefined): number => {
  if (typeof value === "number") return value
  const parsed = parseFloat(String(value))
  return Number.isFinite(parsed) ? parsed : 1
}

const shoppingListAccessQuery = (
  user: AuthenticatedRequest["user"],
  listId: string
) => ({
  $and: [{ _id: listId }, getDataQuery(user)],
})

const mapShoppingListItem = (
  item: ShoppingListItemInput
): Partial<IShoppingListItem> => {
  const parsedQuantity = parseQuantity(item.quantity)
  const foodId = item.foodId || item._id

  return {
    ...(foodId ? { foodId: foodId as unknown as IShoppingListItem["foodId"] } : {}),
    name: item.name,
    estimatedPrice: item.estimatedPrice,
    quantity: parsedQuantity,
    unit: item.unit || "kpl",
    category: item.category || item.categories || [],
    calories: item.calories || 0,
    price: item.price || 0,
    bought: false,
  }
}

const mergeFoodIdIntoItems = (list: {
  items: Array<Record<string, unknown>>
}) => {
  list.items = list.items.map((item) => {
    if (item.foodId && typeof item.foodId === "object") {
      const foodId = item.foodId as {
        image?: { url?: string }
        category?: string[]
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
      }
    }
    return item
  })
  return list
}

exports.createShoppingList = async (
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
    const shoppingList = new ShoppingList({
      userId: ownership.userId,
      household: ownership.household,
      name,
      description,
      items: items.map(mapShoppingListItem),
      totalEstimatedPrice,
    })

    await shoppingList.save()

    res.json({ success: true, shoppingList })
  } catch (error: unknown) {
    console.error("Error creating shopping list:", error)
    res.status(400).json({ success: false, error: getErrorMessage(error) })
  }
}

exports.getShoppingLists = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const query = getDataQuery(req.user)
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

exports.updateShoppingList = async (
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
    const query = shoppingListAccessQuery(req.user, id)

    await ShoppingList.findOneAndUpdate(
      query,
      {
        ...(items ? { items: items.map(mapShoppingListItem) } : {}),
        ...(totalEstimatedPrice !== undefined ? { totalEstimatedPrice } : {}),
      },
      { new: true }
    )

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

exports.markItemAsBought = async (
  req: AuthenticatedRequest<{ listId: string; itemId: string }>,
  res: Response
) => {
  try {
    const { listId, itemId } = req.params

    const shoppingList = await ShoppingList.findOne(
      shoppingListAccessQuery(req.user, listId)
    )

    if (!shoppingList) {
      return res.status(404).json({
        success: false,
        message: "Shopping list not found",
      })
    }

    const item = shoppingList.items.find(
      (listItem) => listItem._id?.toString() === itemId
    )

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found in shopping list",
      })
    }

    item.bought = true

    const pantry = await getCanonicalPantry(req.user)

    pantry.items.push({
      foodId: item.foodId,
      name: item.name,
      quantity: item.quantity || 1,
      unit: item.unit || "kpl",
      expirationDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      category: item.category || [],
      calories: item.calories || 0,
      price: item.price || item.estimatedPrice || 0,
      addedFrom: "shopping-list",
    } as IPantryItem)

    await Promise.all([shoppingList.save(), pantry.save()])

    res.json({
      success: true,
      message: "Item marked as bought and added to pantry",
      shoppingList,
      pantry,
    })
  } catch (error: unknown) {
    console.error("Error in markItemAsBought:", error)
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    })
  }
}

exports.addItemsToShoppingList = async (
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
      shoppingListAccessQuery(req.user, id)
    )

    if (!shoppingList) {
      return res.status(404).json({
        success: false,
        message: "Shopping list not found or unauthorized",
      })
    }

    shoppingList.items.push(
      ...(items.map(mapShoppingListItem) as IShoppingListItem[])
    )

    shoppingList.totalEstimatedPrice = shoppingList.items.reduce(
      (total, item) => total + (item.estimatedPrice || 0),
      0
    )

    await shoppingList.save()

    res.json({ success: true, shoppingList })
  } catch (error: unknown) {
    console.error("Error in addItemsToShoppingList:", error)
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    })
  }
}

exports.deleteShoppingList = async (
  req: AuthenticatedRequest<{ id: string }>,
  res: Response
) => {
  try {
    const { id } = req.params

    const shoppingList = await ShoppingList.findOneAndDelete(
      shoppingListAccessQuery(req.user, id)
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
