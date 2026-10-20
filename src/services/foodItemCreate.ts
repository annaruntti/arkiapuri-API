import type { Model } from "mongoose"
import type { FoodLocation, IFoodItem } from "../models/foodItem"
import type { IUser, IUserModel } from "../models/user"
import { resolveModule } from "../helpers/controllerUtils"
import {
  EMPTY_QUANTITIES,
  normalizeNutrition,
  resolveIsFood,
  sanitizeFoodFields,
} from "./foodItemFields"

const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))
const User = resolveModule<IUserModel>(require("../models/user"))

export type CreateFoodItemInput = {
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
  quantities?: {
    meal?: string | number
    "shopping-list"?: string | number
    pantry?: string | number
  }
}

export type CreateFoodItemResult =
  | { status: "ok"; foodItem: IFoodItem }
  | { status: "bad_request"; message: string }

/**
 * Create a catalog food item and attach it to the user.
 */
export const createFoodItemForUser = async (
  user: IUser,
  body: CreateFoodItemInput
): Promise<CreateFoodItemResult> => {
  const {
    name,
    isFood: isFoodBody,
    category,
    price,
    calories,
    nutrition,
    expirationDate,
    unit,
  } = body

  if (!name) {
    return { status: "bad_request", message: "Name is required" }
  }

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
    user: user._id,
    expirationDate: safeFields.expirationDate,
    locations: [],
    quantities: { ...EMPTY_QUANTITIES },
    unit: unit || "kpl",
  })

  await foodItem.save()

  await User.findByIdAndUpdate(user._id, {
    $push: { foodItems: foodItem._id },
  })

  return { status: "ok", foodItem }
}
