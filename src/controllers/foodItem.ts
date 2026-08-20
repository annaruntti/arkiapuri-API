import { Response } from "express"
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
  resolveModule,
} from "../helpers/controllerUtils"
import {
  getDataQuery,
  getHouseholdMemberIds,
  resolveHouseholdId,
} from "../helpers/householdHelpers"
import { getCanonicalPantry } from "../helpers/pantryHelpers"
import { lookupFoodsByName, toCatalogFoodMatch } from "../services/foodNameLookup"
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

const EMPTY_QUANTITIES: IFoodItem["quantities"] = {
  meal: 0,
  "shopping-list": 0,
  pantry: 0,
}

const CATALOG_UPDATE_KEYS = [
  "name",
  "isFood",
  "category",
  "unit",
  "packageQuantity",
  "price",
  "calories",
  "nutrition",
  "expirationDate",
  "expireDay",
  "image",
  "openFoodFactsData",
] as const

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
    const updates: UpdateFoodItemBody = {}
    for (const key of CATALOG_UPDATE_KEYS) {
      if (req.body[key as keyof UpdateFoodItemBody] !== undefined) {
        ;(updates as Record<string, unknown>)[key] =
          req.body[key as keyof UpdateFoodItemBody]
      }
    }

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
      $and: [
        {
          $or: [
            { "foodItems.foodId": existingItem._id },
            { foodItems: existingItem._id },
          ],
        },
        await getDataQuery(req.user, "user"),
      ],
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

    if (location === "pantry") {
      const pantry = await getCanonicalPantry(req.user)
      const row = pantry.items.find(
        (item) => String(item.foodId) === String(foodItem._id)
      )
      if (!row) {
        return res.status(400).json({
          success: false,
          message: "Item not found in pantry",
        })
      }

      switch (action) {
        case "add":
          row.quantity += quantity
          break
        case "subtract":
          row.quantity = Math.max(0, row.quantity - quantity)
          break
        case "set":
          row.quantity = Math.max(0, quantity)
          break
        default:
          return res.status(400).json({
            success: false,
            message: "Invalid action",
          })
      }

      await pantry.save()
      return res.json({
        success: true,
        foodItem,
        message: `Quantity ${action}ed in pantry`,
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

    if (fromLocation === toLocation) {
      return res.status(400).json({
        success: false,
        message: "Source and destination must be different",
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

    const usesPantry = fromLocation === "pantry" || toLocation === "pantry"
    const pantry = usesPantry ? await getCanonicalPantry(req.user) : null

    if (usesPantry && !pantry) {
      return res.status(500).json({
        success: false,
        message: "Pantry not available",
      })
    }

    if (fromLocation === "pantry") {
      if (!pantry) {
        return res.status(500).json({
          success: false,
          message: "Pantry not available",
        })
      }
      const row = pantry.items.find(
        (item) => String(item.foodId) === String(foodItem._id)
      )
      if (!row) {
        return res.status(400).json({
          success: false,
          message: "Item not found in pantry",
        })
      }
      const available = Number(row.quantity) || 0
      if (available < quantity) {
        return res.status(400).json({
          success: false,
          message: "Not enough quantity in pantry",
        })
      }
      row.quantity = available - quantity
    } else if (foodItem.quantities[fromLocation] < quantity) {
      return res.status(400).json({
        success: false,
        message: `Not enough quantity in ${fromLocation}`,
      })
    } else {
      foodItem.quantities[fromLocation] -= quantity
    }

    if (toLocation === "pantry") {
      if (!pantry) {
        return res.status(500).json({
          success: false,
          message: "Pantry not available",
        })
      }
      const row = pantry.items.find(
        (item) => String(item.foodId) === String(foodItem._id)
      )
      if (row) {
        row.quantity = (Number(row.quantity) || 0) + quantity
      } else {
        pantry.items.push({
          foodId: foodItem._id,
          name: foodItem.name,
          quantity,
          unit: foodItem.unit || "kpl",
          category: foodItem.category || [],
          calories: foodItem.calories || 0,
          price: foodItem.price || 0,
          addedFrom: "pantry",
        } as IPantryItem)
      }
    } else {
      foodItem.quantities[toLocation] += quantity
    }

    // Catalog must not keep pantry stock; that lives on the Pantry document.
    if (usesPantry) {
      foodItem.quantities.pantry = 0
    }

    if (pantry) {
      await pantry.save()
    }
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
      locations: [],
      quantities: { ...EMPTY_QUANTITIES },
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
      .select("name category unit calories nutrition openFoodFactsData")
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

    const matchingIds = new Set(
      matchingItems.map((item) => String(item._id))
    )

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
        const populatedId =
          pantryItem.foodId && typeof pantryItem.foodId === "object"
            ? String(pantryItem.foodId._id)
            : pantryItem.foodId
              ? String(pantryItem.foodId)
              : ""
        const populatedName = getPopulatedFoodName(pantryItem.foodId)
        const itemName = populatedName ?? pantryItem.name
        const pantryItemName = normalizeName(itemName)

        if (
          (populatedId && matchingIds.has(populatedId)) ||
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
        const populatedId =
          listItem.foodId && typeof listItem.foodId === "object"
            ? String(listItem.foodId._id)
            : listItem.foodId
              ? String(listItem.foodId)
              : ""
        const populatedName = getPopulatedFoodName(listItem.foodId)
        const itemName = populatedName ?? listItem.name
        const listItemName = normalizeName(itemName)

        if (
          (populatedId && matchingIds.has(populatedId)) ||
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
        quantities: EMPTY_QUANTITIES,
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
