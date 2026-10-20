import { Response } from "express"
import type { FilterQuery, Model } from "mongoose"
import type { IFoodItem, FoodLocation } from "../models/foodItem"
import type { IShoppingList } from "../models/shoppingList"
import type { IUserModel } from "../models/user"
import {
  AuthenticatedRequest,
  getErrorMessage,
  resolveModule,
} from "../helpers/controllerUtils"
import {
  getDataQuery,
  getHouseholdMemberIds,
  resolveHouseholdId,
} from "../helpers/householdHelpers"
import { lookupFoodsByName, toCatalogFoodMatch } from "../services/foodNameLookup"
import { checkFoodItemAvailabilityForUser } from "../services/checkFoodItemAvailability"
import { findOrCreateFoodItemForUser } from "../services/findOrCreateFoodItem"
import {
  removeFoodItemImageFile,
  uploadFoodItemImageFile,
} from "../services/foodItemImage"
import {
  moveFoodItemQuantity,
  updateFoodItemQuantity,
  type QuantityAction,
} from "../services/foodItemQuantity"
import {
  EMPTY_QUANTITIES,
  normalizeNutrition,
  resolveIsFood,
  sanitizeFoodFields,
} from "../services/foodItemFields"
import { updateFoodItemForUser } from "../services/foodItemUpdate"

const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))
const User = resolveModule<IUserModel>(require("../models/user"))
const ShoppingList = resolveModule<Model<IShoppingList>>(
  require("../models/shoppingList")
)

interface FoodItemQuantitiesInput {
  meal?: string | number
  "shopping-list"?: string | number
  pantry?: string | number
}

interface CreateFoodItemBody {
  name: string
  isFood?: boolean
  category?: string[]
  price?: number
  calories?: number
  nutrition?: IFoodItem["nutrition"]
  location?: FoodLocation
  locations?: FoodLocation[]
  expirationDate?: string | Date | null
  unit?: string
  quantities?: FoodItemQuantitiesInput
}

interface UpdateFoodItemBody {
  name?: string
  isFood?: boolean
  category?: string[]
  unit?: string
  price?: number
  priceSource?: "user" | "open-prices"
  calories?: number
  nutrition?: IFoodItem["nutrition"]
  locations?: FoodLocation[]
  quantities?: IFoodItem["quantities"]
  expirationDate?: string | Date | null
}

interface FindOrCreateFoodItemBody {
  name: string
  isFood?: boolean
  category?: string[]
  unit?: string
  price?: number
  calories?: number
  location?: FoodLocation
  quantities?: FoodItemQuantitiesInput
}

interface UpdateQuantityBody {
  location: FoodLocation
  quantity: number
  action?: QuantityAction
}

interface MoveItemBody {
  fromLocation: FoodLocation
  toLocation: FoodLocation
  quantity: number
}

interface CheckItemAvailabilityBody {
  name?: string
  foodId?: string
}

interface FoodItemApiResponse {
  success: boolean
  foodItem?: IFoodItem | null
  foodItems?: IFoodItem[]
  message?: string
  error?: string
  isExisting?: boolean
  inPantry?: boolean
  pantryQuantity?: number
  pantryUnit?: string
  inShoppingList?: boolean
  shoppingListQuantity?: number
  shoppingListUnit?: string
  shoppingListId?: IShoppingList["_id"] | null
  hasMatchingFoodItem?: boolean
  matchingFoodItems?: Array<{
    _id: IFoodItem["_id"]
    name: string
    quantities: IFoodItem["quantities"]
  }>
}

export const createFoodItem = async (
  req: AuthenticatedRequest<Record<string, string>, FoodItemApiResponse, CreateFoodItemBody>,
  res: Response<FoodItemApiResponse>
) => {
  try {
    const {
      name,
      isFood: isFoodBody,
      category,
      price,
      calories,
      nutrition,
      expirationDate,
      unit,
    } = req.body

    const isFood = resolveIsFood(isFoodBody, true)
    const nutritionFields = normalizeNutrition(nutrition, calories)
    const safeFields = sanitizeFoodFields(
      {
        category,
        calories: nutritionFields.calories,
        nutrition: nutritionFields.nutrition,
        expirationDate,
      },
      isFood
    )

    const userPrice = Number(price) > 0 ? Number(price) : 0
    const foodItem = new FoodItem({
      name,
      isFood,
      category: safeFields.category || [],
      price: userPrice || price,
      priceSource: userPrice > 0 ? "user" : undefined,
      calories: safeFields.calories,
      nutrition: safeFields.nutrition,
      user: req.user._id,
      expirationDate: safeFields.expirationDate,
      locations: [],
      quantities: { ...EMPTY_QUANTITIES },
      unit: unit || "kpl",
    })

    await foodItem.save()

    await User.findByIdAndUpdate(req.user._id, {
      $push: { foodItems: foodItem._id },
    })

    res.json({ success: true, foodItem })
  } catch (error: unknown) {
    console.error("Error creating food item:", error)
    res.status(400).json({ success: false, error: getErrorMessage(error) })
  }
}

export const getFoodItems = async (
  req: AuthenticatedRequest<
    Record<string, string>,
    FoodItemApiResponse,
    unknown,
    { location?: string | string[] }
  >,
  res: Response<FoodItemApiResponse>
) => {
  try {
    // Catalog only. Pantry contents live on the Pantry document (`GET /pantry`),
    // not on FoodItem.locations / FoodItem.quantities.
    const householdId = resolveHouseholdId(req.user)
    const memberIds = householdId
      ? await getHouseholdMemberIds(householdId)
      : []
    const query: FilterQuery<IFoodItem> = {
      user:
        memberIds.length > 0
          ? { $in: memberIds }
          : req.user._id,
    }
    const foodItems = await FoodItem.find(query)
    res.json({ success: true, foodItems })
  } catch (error: unknown) {
    console.error("Error getting food items:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const updateFoodItem = async (
  req: AuthenticatedRequest<
    { id: string },
    FoodItemApiResponse,
    UpdateFoodItemBody
  >,
  res: Response<FoodItemApiResponse>
) => {
  try {
    const result = await updateFoodItemForUser(
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
    res.json({ success: true, foodItem: result.foodItem })
  } catch (error: unknown) {
    res.status(400).json({ success: false, error: getErrorMessage(error) })
  }
}

export const deleteFoodItem = async (
  req: AuthenticatedRequest<{ id: string }>,
  res: Response<FoodItemApiResponse>
) => {
  try {
    const foodItem = await FoodItem.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    })

    if (!foodItem) {
      return res.status(404).json({
        success: false,
        message: "Food item not found or unauthorized",
      })
    }

    await User.findByIdAndUpdate(req.user._id, {
      $pull: { foodItems: req.params.id },
    })

    res.json({ success: true, message: "Food item deleted successfully" })
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const updateQuantity = async (
  req: AuthenticatedRequest<
    { foodItemId: string },
    FoodItemApiResponse,
    UpdateQuantityBody
  >,
  res: Response<FoodItemApiResponse>
) => {
  try {
    const { foodItemId } = req.params
    const { location, quantity, action = "set" } = req.body
    const result = await updateFoodItemQuantity(
      req.user,
      foodItemId,
      location,
      quantity,
      action
    )

    if (result.status === "bad_request") {
      return res.status(400).json({
        success: false,
        message: result.message,
      })
    }

    res.json({
      success: true,
      foodItem: result.foodItem,
      message: result.message,
    })
  } catch (error: unknown) {
    res.status(400).json({
      success: false,
      error: getErrorMessage(error),
    })
  }
}

export const moveItem = async (
  req: AuthenticatedRequest<
    { foodItemId: string },
    FoodItemApiResponse,
    MoveItemBody
  >,
  res: Response<FoodItemApiResponse>
) => {
  try {
    const { foodItemId } = req.params
    const { fromLocation, toLocation, quantity } = req.body
    const result = await moveFoodItemQuantity(
      req.user,
      foodItemId,
      fromLocation,
      toLocation,
      quantity
    )

    if (result.status === "bad_request") {
      const status = result.message === "Pantry not available" ? 500 : 400
      return res.status(status).json({
        success: false,
        message: result.message,
      })
    }

    res.json({
      success: true,
      foodItem: result.foodItem,
      message: result.message,
    })
  } catch (error: unknown) {
    res.status(400).json({
      success: false,
      error: getErrorMessage(error),
    })
  }
}

export const uploadFoodItemImage = async (
  req: AuthenticatedRequest<{ foodItemId: string }> & {
    file?: Express.Multer.File
  },
  res: Response<FoodItemApiResponse>
) => {
  try {
    const result = await uploadFoodItemImageFile(
      req.user._id,
      req.params.foodItemId,
      req.file
    )

    if (result.status !== "ok") {
      const statusCode =
        result.status === "not_found"
          ? 404
          : result.status === "server_error"
            ? 500
            : 400
      return res
        .status(statusCode)
        .json({ success: false, message: result.message })
    }

    res.json({
      success: true,
      foodItem: result.foodItem,
    })
  } catch (error: unknown) {
    console.error("Upload error:", error)
    res.status(500).json({
      success: false,
      message: "Image upload failed",
      error: getErrorMessage(error),
    })
  }
}

export const findOrCreateFoodItem = async (
  req: AuthenticatedRequest<
    Record<string, string>,
    FoodItemApiResponse,
    FindOrCreateFoodItemBody
  >,
  res: Response<FoodItemApiResponse>
) => {
  try {
    const result = await findOrCreateFoodItemForUser(req.user._id, req.body)
    if (result.status === "bad_request") {
      return res.status(400).json({
        success: false,
        message: result.message,
      })
    }

    return res.json({
      success: true,
      foodItem: result.foodItem,
      isExisting: result.isExisting,
      message: result.message,
    })
  } catch (error: unknown) {
    console.error("Error in findOrCreateFoodItem:", error)
    res.status(400).json({
      success: false,
      error: getErrorMessage(error),
    })
  }
}

export const lookupFoodItemsByName = async (
  req: AuthenticatedRequest<
    Record<string, string>,
    unknown,
    { name?: string; names?: string[] }
  >,
  res: Response
) => {
  try {
    const names = Array.isArray(req.body?.names)
      ? req.body.names
      : req.body?.name
        ? [req.body.name]
        : []
    const cleaned = names
      .map((name) => String(name || "").trim())
      .filter(Boolean)

    if (cleaned.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Tuotenimi puuttuu",
      })
    }

    const householdId = resolveHouseholdId(req.user)
    const memberIds = householdId
      ? await getHouseholdMemberIds(householdId)
      : []
    const catalogQuery =
      memberIds.length > 0
        ? { user: { $in: memberIds } }
        : { user: req.user._id }

    const catalogDocs = await FoodItem.find(catalogQuery)
      .select("name category unit calories nutrition image openFoodFactsData")
      .lean()

    const results = await lookupFoodsByName(
      cleaned,
      catalogDocs.map(toCatalogFoodMatch)
    )

    res.json({ success: true, results })
  } catch (error: unknown) {
    console.error("Error in lookupFoodItemsByName:", error)
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    })
  }
}

export const checkItemAvailability = async (
  req: AuthenticatedRequest<
    Record<string, string>,
    FoodItemApiResponse,
    CheckItemAvailabilityBody
  >,
  res: Response<FoodItemApiResponse>
) => {
  try {
    const result = await checkFoodItemAvailabilityForUser(req.user, req.body)
    if (result.status === "bad_request") {
      return res.status(400).json({
        success: false,
        message: result.message,
      })
    }

    res.json({
      success: true,
      inPantry: result.inPantry,
      pantryQuantity: result.pantryQuantity,
      pantryUnit: result.pantryUnit,
      inShoppingList: result.inShoppingList,
      shoppingListQuantity: result.shoppingListQuantity,
      shoppingListUnit: result.shoppingListUnit,
      shoppingListId: result.shoppingListId,
      hasMatchingFoodItem: result.hasMatchingFoodItem,
      matchingFoodItems: result.matchingFoodItems,
    })
  } catch (error: unknown) {
    console.error("Error checking item availability:", error)
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    })
  }
}

export const removeFoodItemImage = async (
  req: AuthenticatedRequest<{ foodItemId: string }>,
  res: Response<FoodItemApiResponse>
) => {
  try {
    const result = await removeFoodItemImageFile(
      req.user._id,
      req.params.foodItemId
    )

    if (result.status !== "ok") {
      const statusCode =
        result.status === "not_found"
          ? 404
          : result.status === "server_error"
            ? 500
            : 400
      return res
        .status(statusCode)
        .json({ success: false, message: result.message })
    }

    res.json({
      success: true,
      foodItem: result.foodItem,
    })
  } catch (error: unknown) {
    console.error("Remove image error:", error)
    res.status(500).json({
      success: false,
      message: "Image removal failed",
      error: getErrorMessage(error),
    })
  }
}
