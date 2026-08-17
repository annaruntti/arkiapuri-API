import { Request, Response } from "express"
import type { FilterQuery, Model } from "mongoose"
import cloudinary from "../helper/imageUpload"
import fs from "fs"
import type { IFoodItem, FoodLocation } from "../models/foodItem"
import type { IPantry, IPantryItem } from "../models/pantry"
import type { IShoppingList, IShoppingListItem } from "../models/shoppingList"
import type { IUser, IUserModel } from "../models/user"
import {
  AuthenticatedRequest,
  getErrorMessage,
  parseQuantity,
  resolveModule,
} from "../helpers/controllerUtils"
import { getDataQuery } from "../helpers/householdHelpers"
import type { IMeal } from "../models/meal"

const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))
const User = resolveModule<IUserModel>(require("../models/user"))
const Pantry = resolveModule<Model<IPantry>>(require("../models/pantry"))
const ShoppingList = resolveModule<Model<IShoppingList>>(
  require("../models/shoppingList")
)
const Meal = resolveModule<Model<IMeal>>(require("../models/meal"))

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

type UpdateQuantityAction = "add" | "subtract" | "set"

interface UpdateQuantityBody {
  location: FoodLocation
  quantity: number
  action?: UpdateQuantityAction
}

interface MoveItemBody {
  fromLocation: FoodLocation
  toLocation: FoodLocation
  quantity: number
}

interface CheckItemAvailabilityBody {
  name?: string
}

interface CloudinaryUploadResult {
  secure_url: string
  public_id: string
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
  inShoppingList?: boolean
  shoppingListQuantity?: number
  shoppingListId?: IShoppingList["_id"] | null
  hasMatchingFoodItem?: boolean
  matchingFoodItems?: Array<{
    _id: IFoodItem["_id"]
    name: string
    quantities: IFoodItem["quantities"]
  }>
}

type PopulatedFoodRef = Pick<IFoodItem, "_id" | "name">

const FOOD_LOCATIONS: FoodLocation[] = ["meal", "shopping-list", "pantry"]

const resolveIsFood = (value: unknown, fallback = true): boolean => {
  if (value === false || value === "false") return false
  if (value === true || value === "true") return true
  return fallback
}

const sanitizeFoodFields = <
  T extends {
    isFood?: boolean
    category?: string[]
    calories?: number
    nutrition?: IFoodItem["nutrition"]
    expirationDate?: string | Date | null
  },
>(
  fields: T,
  isFood: boolean
): T => {
  if (isFood) return fields
  return {
    ...fields,
    category: [],
    calories: 0,
    nutrition: undefined,
    expirationDate: undefined,
  }
}

const normalizeNutrition = (
  nutrition: IFoodItem["nutrition"] | undefined,
  calories?: number
): { calories?: number; nutrition?: IFoodItem["nutrition"] } => {
  if (!nutrition && (calories === undefined || calories === null)) {
    return { calories }
  }

  const normalized: IFoodItem["nutrition"] = {
    ...(nutrition || {}),
  }
  const resolvedCalories =
    calories !== undefined && calories !== null
      ? Number(calories) || 0
      : normalized.calories !== undefined
        ? Number(normalized.calories) || 0
        : undefined

  if (resolvedCalories !== undefined) {
    normalized.calories = resolvedCalories
  }

  const hasAnyValue = Object.values(normalized).some(
    (value) => typeof value === "number" && !Number.isNaN(value)
  )

  return {
    calories: resolvedCalories,
    nutrition: hasAnyValue ? normalized : undefined,
  }
}

const parseFoodItemQuantity = (value: string | number | undefined): number =>
  parseQuantity(value, { fallback: 0 })

const buildQuantitiesFromBody = (
  body: CreateFoodItemBody
): IFoodItem["quantities"] => {
  if (body.quantities) {
    return {
      meal: parseFoodItemQuantity(body.quantities.meal),
      "shopping-list": parseFoodItemQuantity(body.quantities["shopping-list"]),
      pantry: parseFoodItemQuantity(body.quantities.pantry),
    }
  }

  return { meal: 0, "shopping-list": 0, pantry: 0 }
}

const resolveLocationsFromBody = (body: {
  locations?: FoodLocation[]
  location?: FoodLocation
}): FoodLocation[] => {
  if (body.locations?.length) return body.locations
  if (body.location) return [body.location]
  return ["meal"]
}

const getPopulatedFoodName = (
  foodId: PopulatedFoodRef | undefined | null
): string | null => {
  if (!foodId || typeof foodId !== "object" || !("name" in foodId)) {
    return null
  }
  return foodId.name
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
      quantities: _quantities,
      locations: _locations,
      location: _location,
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

    const foodItem = new FoodItem({
      name,
      isFood,
      category: safeFields.category || [],
      price,
      calories: safeFields.calories,
      nutrition: safeFields.nutrition,
      user: req.user._id,
      expirationDate: safeFields.expirationDate,
      locations: isFood
        ? resolveLocationsFromBody(req.body)
        : ["shopping-list"],
      quantities: buildQuantitiesFromBody(req.body),
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
    const { location } = req.query
    const query: FilterQuery<IFoodItem> = { user: req.user._id }

    if (location) {
      const locations = Array.isArray(location) ? location : [location]
      query.locations = { $in: locations }
    }

    const foodItems = await FoodItem.find(query)
    res.json({ success: true, foodItems })
  } catch (error: unknown) {
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
    const updates: UpdateFoodItemBody = { ...req.body }

    if (updates.nutrition !== undefined || updates.calories !== undefined) {
      const nutritionFields = normalizeNutrition(
        updates.nutrition,
        updates.calories
      )
      updates.calories = nutritionFields.calories
      updates.nutrition = nutritionFields.nutrition
    }

    if (updates.isFood !== undefined) {
      const isFood = resolveIsFood(updates.isFood, true)
      const sanitized = sanitizeFoodFields(
        {
          category: updates.category,
          calories: updates.calories,
          nutrition: updates.nutrition,
          expirationDate: updates.expirationDate,
        },
        isFood
      )
      updates.category = sanitized.category
      updates.calories = sanitized.calories
      updates.nutrition = sanitized.nutrition
      updates.expirationDate = sanitized.expirationDate
      updates.isFood = isFood
    }

    const foodItem = await FoodItem.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      updates,
      { new: true }
    )

    if (foodItem) {
      return res.json({ success: true, foodItem })
    }

    // Household meals can reference another member's food items. Allow update
    // when the item is used by a meal the current user can access.
    const existingItem = await FoodItem.findById(req.params.id)
    if (!existingItem) {
      return res.status(404).json({
        success: false,
        message: "Food item not found or unauthorized",
      })
    }

    const sharedMeal = await Meal.findOne({
      foodItems: existingItem._id,
      ...getDataQuery(req.user, "user"),
    }).select("_id")

    if (!sharedMeal) {
      return res.status(404).json({
        success: false,
        message: "Food item not found or unauthorized",
      })
    }

    const sharedFoodItem = await FoodItem.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true }
    )

    res.json({ success: true, foodItem: sharedFoodItem })
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

    if (!FOOD_LOCATIONS.includes(location)) {
      return res.status(400).json({
        success: false,
        message: "Invalid location",
      })
    }

    const foodItem = await FoodItem.findOne({
      _id: foodItemId,
      user: req.user._id,
    })

    if (!foodItem) {
      return res.status(400).json({
        success: false,
        message: "Food item not found",
      })
    }

    switch (action) {
      case "add":
        foodItem.quantities[location] += quantity
        break
      case "subtract":
        foodItem.quantities[location] = Math.max(
          0,
          foodItem.quantities[location] - quantity
        )
        break
      case "set":
        foodItem.quantities[location] = Math.max(0, quantity)
        break
      default:
        return res.status(400).json({
          success: false,
          message: "Invalid action",
        })
    }

    await foodItem.save()

    res.json({
      success: true,
      foodItem,
      message: `Quantity ${action}ed in ${location}`,
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

    if (
      !FOOD_LOCATIONS.includes(fromLocation) ||
      !FOOD_LOCATIONS.includes(toLocation)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid location",
      })
    }

    const foodItem = await FoodItem.findOne({
      _id: foodItemId,
      user: req.user._id,
    })

    if (!foodItem) {
      return res.status(400).json({
        success: false,
        message: "Food item not found",
      })
    }

    if (foodItem.quantities[fromLocation] < quantity) {
      return res.status(400).json({
        success: false,
        message: `Not enough quantity in ${fromLocation}`,
      })
    }

    foodItem.quantities[fromLocation] -= quantity
    foodItem.quantities[toLocation] += quantity

    await foodItem.save()

    res.json({
      success: true,
      foodItem,
      message: `Moved ${quantity} from ${fromLocation} to ${toLocation}`,
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
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided",
      })
    }

    const { foodItemId } = req.params

    const foodItem = await FoodItem.findOne({
      _id: foodItemId,
      user: req.user._id,
    })

    if (!foodItem) {
      return res.status(404).json({
        success: false,
        message: "Food item not found or unauthorized",
      })
    }

    if (
      !process.env.CLOUDINARY_USER_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_KEY_SECRET
    ) {
      return res.status(500).json({
        success: false,
        message: "Cloud storage not configured",
      })
    }

    try {
      const result: CloudinaryUploadResult = await cloudinary.uploader.upload(
        req.file.path,
        {
          folder: "food-item-images",
          use_filename: true,
        }
      )

      const updatedFoodItem = await FoodItem.findByIdAndUpdate(
        foodItemId,
        {
          image: {
            url: result.secure_url,
            publicId: result.public_id,
          },
        },
        { new: true }
      )

      fs.unlinkSync(req.file.path)

      res.json({
        success: true,
        foodItem: updatedFoodItem,
      })
    } catch (uploadError: unknown) {
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path)
      }
      throw uploadError
    }
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
    const {
      name,
      isFood: isFoodBody,
      category,
      unit,
      price,
      calories,
      location,
      quantities,
    } = req.body

    const isFood = resolveIsFood(isFoodBody, true)

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Food item name is required",
      })
    }

    const normalizeName = (str: string): string =>
      str
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[^\w\s]/g, "")

    const normalizedSearchName = normalizeName(name)

    const matchesIsFood = (item: IFoodItem) =>
      resolveIsFood(item.isFood, true) === isFood

    let existingFoodItem: IFoodItem | null = await FoodItem.findOne({
      user: req.user._id,
      isFood: isFood ? { $ne: false } : false,
      $expr: {
        $eq: [
          { $toLower: { $trim: { input: "$name" } } },
          name.toLowerCase().trim(),
        ],
      },
    })

    // Exact normalized match only (no fuzzy). Character-overlap scoring
    // previously merged unrelated names (e.g. ranskankerma → mansikkamehu).
    if (!existingFoodItem) {
      const candidates: IFoodItem[] = await FoodItem.find({
        user: req.user._id,
        isFood: isFood ? { $ne: false } : false,
      })
      existingFoodItem =
        candidates.find(
          (item) =>
            matchesIsFood(item) &&
            normalizeName(item.name) === normalizedSearchName
        ) || null
    }

    if (existingFoodItem) {
      if (quantities) {
        for (const loc of FOOD_LOCATIONS) {
          if (quantities[loc] !== undefined) {
            existingFoodItem.quantities[loc] =
              (existingFoodItem.quantities[loc] || 0) +
              parseQuantity(quantities[loc])
          }
        }
      }

      if (isFood && category?.length) {
        existingFoodItem.category = [
          ...new Set([...(existingFoodItem.category || []), ...category]),
        ]
      }
      if (unit) existingFoodItem.unit = unit
      if (price !== undefined && price > 0) {
        existingFoodItem.price =
          existingFoodItem.price && existingFoodItem.price > 0
            ? (existingFoodItem.price + price) / 2
            : price
      }
      if (isFood && calories !== undefined && calories > 0) {
        existingFoodItem.calories =
          existingFoodItem.calories && existingFoodItem.calories > 0
            ? (existingFoodItem.calories + calories) / 2
            : calories
      }

      if (location && !existingFoodItem.locations.includes(location)) {
        existingFoodItem.locations.push(location)
      }

      await existingFoodItem.save()

      return res.json({
        success: true,
        foodItem: existingFoodItem,
        isExisting: true,
        message: "Found existing food item and updated",
      })
    }

    const safeFields = sanitizeFoodFields(
      { category, calories, expirationDate: undefined },
      isFood
    )

    const foodItem = new FoodItem({
      name,
      isFood,
      category: safeFields.category || [],
      unit: unit || "kpl",
      price: price || 0,
      calories: safeFields.calories || 0,
      user: req.user._id,
      locations: isFood
        ? location
          ? [location]
          : ["meal"]
        : ["shopping-list"],
      quantities: quantities
        ? {
            meal: parseQuantity(quantities.meal, { fallback: 0 }),
            "shopping-list": parseQuantity(quantities["shopping-list"], {
              fallback: 0,
            }),
            pantry: parseQuantity(quantities.pantry, { fallback: 0 }),
          }
        : {
            meal: location === "meal" ? 1 : 0,
            "shopping-list": location === "shopping-list" || !isFood ? 1 : 0,
            pantry: location === "pantry" ? 1 : 0,
          },
    })

    await foodItem.save()

    await User.findByIdAndUpdate(req.user._id, {
      $push: { foodItems: foodItem._id },
    })

    return res.json({
      success: true,
      foodItem,
      isExisting: false,
      message: "Created new food item",
    })
  } catch (error: unknown) {
    console.error("Error in findOrCreateFoodItem:", error)
    res.status(400).json({
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
    const { name } = req.body

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Food item name is required",
      })
    }

    const normalizeName = (str: string): string =>
      str
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[^\w\s]/g, "")

    const normalizedSearchName = normalizeName(name)

    const allFoodItems: IFoodItem[] = await FoodItem.find({
      user: req.user._id,
    })
    const matchingItems: IFoodItem[] = []

    for (const item of allFoodItems) {
      const normalizedItemName = normalizeName(item.name)
      if (
        normalizedItemName === normalizedSearchName ||
        normalizedItemName.includes(normalizedSearchName) ||
        normalizedSearchName.includes(normalizedItemName)
      ) {
        matchingItems.push(item)
      }
    }

    const pantry = await Pantry.findOne({
      userId: req.user._id,
    }).populate<{ items: Array<Omit<IPantryItem, "foodId"> & { foodId?: PopulatedFoodRef | null }> }>(
      "items.foodId",
      "name"
    )

    let inPantry = false
    let pantryQuantity = 0
    if (pantry?.items) {
      for (const pantryItem of pantry.items) {
        const populatedName = getPopulatedFoodName(pantryItem.foodId)
        const itemName = populatedName ?? pantryItem.name
        const pantryItemName = normalizeName(itemName)

        if (
          pantryItemName === normalizedSearchName ||
          pantryItemName.includes(normalizedSearchName) ||
          normalizedSearchName.includes(pantryItemName)
        ) {
          inPantry = true
          pantryQuantity = pantryItem.quantity || 0
          break
        }
      }
    }

    const shoppingLists = await ShoppingList.find({
      userId: req.user._id,
    }).populate<{
      items: Array<
        Omit<IShoppingListItem, "foodId"> & { foodId?: PopulatedFoodRef | null }
      >
    }>("items.foodId", "name")

    let inShoppingList = false
    let shoppingListQuantity = 0
    let shoppingListId: IShoppingList["_id"] | null = null

    for (const list of shoppingLists) {
      if (!list.items) continue

      for (const listItem of list.items) {
        const populatedName = getPopulatedFoodName(listItem.foodId)
        const itemName = populatedName ?? listItem.name
        const listItemName = normalizeName(itemName)

        if (
          listItemName === normalizedSearchName ||
          listItemName.includes(normalizedSearchName) ||
          normalizedSearchName.includes(listItemName)
        ) {
          inShoppingList = true
          shoppingListQuantity = listItem.quantity || 0
          shoppingListId = list._id
          break
        }
      }

      if (inShoppingList) break
    }

    res.json({
      success: true,
      inPantry,
      pantryQuantity,
      inShoppingList,
      shoppingListQuantity,
      shoppingListId,
      hasMatchingFoodItem: matchingItems.length > 0,
      matchingFoodItems: matchingItems.map((item) => ({
        _id: item._id,
        name: item.name,
        quantities: item.quantities,
      })),
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
    const { foodItemId } = req.params

    const foodItem = await FoodItem.findOne({
      _id: foodItemId,
      user: req.user._id,
    })

    if (!foodItem) {
      return res.status(404).json({
        success: false,
        message: "Food item not found or unauthorized",
      })
    }

    if (!foodItem.image?.publicId) {
      return res.status(400).json({
        success: false,
        message: "No image to remove",
      })
    }

    if (
      !process.env.CLOUDINARY_USER_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_KEY_SECRET
    ) {
      return res.status(500).json({
        success: false,
        message: "Cloud storage not configured",
      })
    }

    try {
      await cloudinary.uploader.destroy(foodItem.image.publicId)

      const updatedFoodItem = await FoodItem.findByIdAndUpdate(
        foodItemId,
        { $unset: { image: 1 } },
        { new: true }
      )

      res.json({
        success: true,
        foodItem: updatedFoodItem,
      })
    } catch (deleteError: unknown) {
      console.error("Error deleting from Cloudinary:", deleteError)
      throw deleteError
    }
  } catch (error: unknown) {
    console.error("Remove image error:", error)
    res.status(500).json({
      success: false,
      message: "Image removal failed",
      error: getErrorMessage(error),
    })
  }
}
