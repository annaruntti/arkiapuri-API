import type { Model } from "mongoose"
import type { IFoodItem } from "../models/foodItem"
import type { IMeal } from "../models/meal"
import type { IUser } from "../models/user"
import { resolveModule } from "../helpers/controllerUtils"
import { getDataQuery } from "../helpers/householdHelpers"
import {
  CATALOG_UPDATE_KEYS,
  normalizeNutrition,
  resolveIsFood,
  sanitizeFoodFields,
} from "./foodItemFields"

const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))
const Meal = resolveModule<Model<IMeal>>(require("../models/meal"))

export type UpdateFoodItemBody = {
  name?: string
  isFood?: boolean
  category?: string[]
  unit?: string
  price?: number
  priceSource?: "user" | "open-prices"
  calories?: number
  nutrition?: IFoodItem["nutrition"]
  locations?: IFoodItem["locations"]
  quantities?: IFoodItem["quantities"]
  expirationDate?: string | Date | null
}

export type FoodItemUpdateResult =
  | { status: "ok"; foodItem: IFoodItem | null }
  | { status: "not_found"; message: string }

/**
 * Pick and normalize catalog fields from a raw update payload.
 */
export const buildCatalogFoodItemUpdates = (
  body: UpdateFoodItemBody
): UpdateFoodItemBody => {
  const updates: UpdateFoodItemBody = {}
  for (const key of CATALOG_UPDATE_KEYS) {
    if (body[key as keyof UpdateFoodItemBody] !== undefined) {
      ;(updates as Record<string, unknown>)[key] =
        body[key as keyof UpdateFoodItemBody]
    }
  }

  if (updates.nutrition !== undefined) {
    const nutritionFields = normalizeNutrition(
      updates.nutrition,
      updates.calories
    )
    updates.calories = nutritionFields.calories
    updates.nutrition = nutritionFields.nutrition
  } else if (updates.calories !== undefined) {
    updates.calories = Number(updates.calories) || 0
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

  if (updates.price !== undefined && Number(updates.price) > 0) {
    updates.priceSource = "user"
  }

  return updates
}

/**
 * Update a food item owned by the user, or shared via an accessible meal.
 */
export const updateFoodItemForUser = async (
  user: IUser,
  foodItemId: string,
  body: UpdateFoodItemBody
): Promise<FoodItemUpdateResult> => {
  const updates = buildCatalogFoodItemUpdates(body)

  const foodItem = await FoodItem.findOneAndUpdate(
    { _id: foodItemId, user: user._id },
    updates,
    { new: true }
  )

  if (foodItem) {
    return { status: "ok", foodItem }
  }

  const existingItem = await FoodItem.findById(foodItemId)
  if (!existingItem) {
    return {
      status: "not_found",
      message: "Food item not found or unauthorized",
    }
  }

  const sharedMeal = await Meal.findOne({
    $and: [
      {
        $or: [
          { "foodItems.foodId": existingItem._id },
          { foodItems: existingItem._id },
        ],
      },
      await getDataQuery(user, "user"),
    ],
  }).select("_id")

  if (!sharedMeal) {
    return {
      status: "not_found",
      message: "Food item not found or unauthorized",
    }
  }

  const sharedFoodItem = await FoodItem.findByIdAndUpdate(
    foodItemId,
    updates,
    { new: true }
  )

  return { status: "ok", foodItem: sharedFoodItem }
}
