import type { Model } from "mongoose"
import type { IFoodItem } from "../models/foodItem"
import type { IUser, IUserModel } from "../models/user"
import { resolveModule } from "../helpers/controllerUtils"
import {
  EMPTY_QUANTITIES,
  normalizeFoodItemName,
  resolveIsFood,
  sanitizeFoodFields,
} from "./foodItemFields"

const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))
const User = resolveModule<IUserModel>(require("../models/user"))

export interface FindOrCreateFoodItemInput {
  name: string
  isFood?: boolean
  category?: string[]
  unit?: string
  price?: number
  calories?: number
}

export const findOrCreateFoodItemForUser = async (
  userId: IUser["_id"],
  input: FindOrCreateFoodItemInput
) => {
  const {
    name,
    isFood: isFoodBody,
    category,
    unit,
    price,
    calories,
  } = input

  const isFood = resolveIsFood(isFoodBody, true)
  if (!name) {
    return {
      status: "bad_request" as const,
      message: "Food item name is required",
    }
  }

  const normalizedSearchName = normalizeFoodItemName(name)

  const matchesIsFood = (item: IFoodItem) =>
    resolveIsFood(item.isFood, true) === isFood

  let existingFoodItem: IFoodItem | null = await FoodItem.findOne({
    user: userId,
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
      user: userId,
      isFood: isFood ? { $ne: false } : false,
    })
    existingFoodItem =
      candidates.find(
        (item) =>
          matchesIsFood(item) &&
          normalizeFoodItemName(item.name) === normalizedSearchName
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
      if (
        existingFoodItem.priceSource === "open-prices" ||
        !(existingFoodItem.price && existingFoodItem.price > 0)
      ) {
        existingFoodItem.price = price
      } else {
        existingFoodItem.price = (existingFoodItem.price + price) / 2
      }
      existingFoodItem.priceSource = "user"
    }
    if (isFood && calories !== undefined && calories > 0) {
      existingFoodItem.calories =
        existingFoodItem.calories && existingFoodItem.calories > 0
          ? (existingFoodItem.calories + calories) / 2
          : calories
    }

    await existingFoodItem.save()

    return {
      status: "ok" as const,
      foodItem: existingFoodItem,
      isExisting: true,
      message: "Found existing food item and updated",
    }
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
    priceSource: price && price > 0 ? "user" : undefined,
    calories: safeFields.calories || 0,
    user: userId,
    locations: [],
    quantities: { ...EMPTY_QUANTITIES },
  })

  await foodItem.save()

  await User.findByIdAndUpdate(userId, {
    $push: { foodItems: foodItem._id },
  })

  return {
    status: "ok" as const,
    foodItem,
    isExisting: false,
    message: "Created new food item",
  }
}
