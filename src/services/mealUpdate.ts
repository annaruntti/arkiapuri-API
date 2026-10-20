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

const Meal = resolveModule<Model<IMeal>>(require("../models/meal"))
const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))

const FOOD_ITEM_POPULATE = {
  path: "foodItems.foodId",
  select: MEAL_FOOD_CATALOG_SELECT,
}

const mealAccessQuery = async (user: IUser, mealId: string) => ({
  $and: [{ _id: mealId }, await getDataQuery(user, "user")],
})

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
  const updateData: CreateMealInput = { ...body }
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
      const validFoodItems = await FoodItem.find({
        _id: { $in: uniqueIds },
      })
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
