import type { Model } from "mongoose"
import type { IFoodItem } from "../models/foodItem"
import type { IMeal } from "../models/meal"
import type { IUser } from "../models/user"
import { resolveModule } from "../helpers/controllerUtils"
import { getDataQuery } from "../helpers/householdHelpers"
import {
  flattenMealFoodItems,
  MEAL_FOOD_CATALOG_SELECT,
  normalizeMealCategories,
  normalizeMealIngredientInputs,
} from "../helpers/mealIngredients"
import {
  clampEatingDatesToCooking,
  normalizeMealDate,
  normalizeMealDates,
  normalizeServings,
} from "../helpers/mealDates"
import {
  joinRecipeSteps,
  normalizeRecipeSteps,
} from "../helpers/recipeSteps"
import type { CreateMealInput } from "./mealCreate"
import { foodItemsOwnedFilter } from "../helpers/foodItemAccess"

const Meal = resolveModule<Model<IMeal>>(require("../models/meal"))
const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))

const FOOD_ITEM_POPULATE = {
  path: "foodItems.foodId",
  select: MEAL_FOOD_CATALOG_SELECT,
}

const MEAL_UPDATE_KEYS = [
  "name",
  "recipe",
  "recipeSteps",
  "difficultyLevel",
  "cookingTime",
  "foodItems",
  "defaultRoles",
  "mealCategory",
  "plannedCookingDate",
  "plannedEatingDates",
  "servings",
] as const

const mealAccessQuery = async (user: IUser, mealId: string) => ({
  $and: [{ _id: mealId }, await getDataQuery(user, "user")],
})

const pickMealUpdateFields = (body: CreateMealInput): CreateMealInput => {
  const picked: CreateMealInput = {}
  for (const key of MEAL_UPDATE_KEYS) {
    if (body[key] !== undefined) {
      ;(picked as Record<string, unknown>)[key] = body[key]
    }
  }
  return picked
}

export type UpdateMealResult =
  | { status: "ok"; meal: ReturnType<typeof flattenMealFoodItems> }
  | { status: "not_found"; message: string }
  | { status: "bad_request"; message: string }

/**
 * Validate and persist meal updates for the user/household.
 */
export const updateMealForUser = async (
  user: IUser,
  mealId: string,
  body: CreateMealInput
): Promise<UpdateMealResult> => {
  const updateData = pickMealUpdateFields(body)
  const accessQuery = await mealAccessQuery(user, mealId)

  const meal = await Meal.findOne(accessQuery)
  if (!meal) {
    return {
      status: "not_found",
      message: "Meal not found or unauthorized",
    }
  }

  if (updateData.plannedCookingDate !== undefined) {
    updateData.plannedCookingDate =
      normalizeMealDate(updateData.plannedCookingDate) ?? undefined
  }

  if (updateData.plannedEatingDates !== undefined) {
    let eatingDates = normalizeMealDates(updateData.plannedEatingDates)
    const cookingDate =
      updateData.plannedCookingDate !== undefined
        ? updateData.plannedCookingDate
        : meal.plannedCookingDate
    if (eatingDates.length === 0 && cookingDate) {
      eatingDates = normalizeMealDates([cookingDate])
    }
    updateData.plannedEatingDates = clampEatingDatesToCooking(
      eatingDates,
      cookingDate
    )
  } else if (updateData.plannedCookingDate !== undefined) {
    updateData.plannedEatingDates = clampEatingDatesToCooking(
      normalizeMealDates(meal.plannedEatingDates),
      updateData.plannedCookingDate
    )
  }

  if (updateData.servings !== undefined) {
    updateData.servings = normalizeServings(updateData.servings)
  }

  if (updateData.mealCategory !== undefined) {
    updateData.mealCategory = normalizeMealCategories(updateData.mealCategory)
  }

  if (updateData.foodItems !== undefined) {
    const ingredientRows = normalizeMealIngredientInputs(updateData.foodItems)
    if (ingredientRows.length > 0) {
      const foodItemIds = ingredientRows.map((row) => row.foodId)
      const uniqueIds = [...new Set(foodItemIds)]
      const validFoodItems = await FoodItem.find(
        await foodItemsOwnedFilter(user, uniqueIds)
      )
      if (validFoodItems.length !== uniqueIds.length) {
        return { status: "bad_request", message: "Invalid food items" }
      }
    }
    updateData.foodItems = ingredientRows as CreateMealInput["foodItems"]
  }

  if (updateData.recipeSteps !== undefined) {
    const steps = normalizeRecipeSteps(updateData.recipeSteps)
    updateData.recipeSteps = steps
    if (steps.length) {
      updateData.recipe = joinRecipeSteps(steps)
    }
  }

  const updatedMeal = await Meal.findOneAndUpdate(accessQuery, updateData, {
    new: true,
  }).populate(FOOD_ITEM_POPULATE)

  return {
    status: "ok",
    meal: flattenMealFoodItems(updatedMeal),
  }
}
