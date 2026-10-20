import type { Model } from "mongoose"
import type { IFoodItem } from "../models/foodItem"
import type { IMeal, MealRole } from "../models/meal"
import type { IUser, IUserModel } from "../models/user"
import { resolveModule } from "../helpers/controllerUtils"
import { getDataOwnership } from "../helpers/householdHelpers"
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
  hasRecipeContent,
  joinRecipeSteps,
  normalizeRecipeSteps,
} from "../helpers/recipeSteps"

const Meal = resolveModule<Model<IMeal>>(require("../models/meal"))
const User = resolveModule<IUserModel>(require("../models/user"))
const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))

const FOOD_ITEM_POPULATE = {
  path: "foodItems.foodId",
  select: MEAL_FOOD_CATALOG_SELECT,
}

const VALID_ROLES: MealRole[] = [
  "breakfast",
  "lunch",
  "snack",
  "dinner",
  "supper",
  "dessert",
  "other",
]

export type CreateMealInput = {
  name?: string
  recipe?: string
  recipeSteps?: string[]
  difficultyLevel?: "easy" | "medium" | "hard"
  cookingTime?: number
  foodItems?: Array<
    | string
    | {
        foodId?: string
        _id?: string
        quantity?: number | string
        unit?: string
      }
  >
  defaultRoles?: string[]
  mealCategory?: IMeal["mealCategory"] | string
  plannedCookingDate?: string
  plannedEatingDates?: string[]
  servings?: number | string
  createdAt?: string | Date
}

export type CreateMealResult =
  | { status: "ok"; meal: ReturnType<typeof flattenMealFoodItems> }
  | { status: "bad_request"; message: string }

/**
 * Validate and persist a new meal for the user/household.
 */
export const createMealForUser = async (
  user: IUser,
  body: CreateMealInput
): Promise<CreateMealResult> => {
  const {
    name,
    recipe,
    recipeSteps,
    difficultyLevel,
    cookingTime,
    foodItems,
    defaultRoles,
    mealCategory,
    plannedCookingDate,
    plannedEatingDates,
    servings,
    createdAt,
  } = body

  const steps = normalizeRecipeSteps(recipeSteps)
  const recipeText = steps.length
    ? joinRecipeSteps(steps)
    : String(recipe || "").trim()

  if (!name || !hasRecipeContent(steps, recipeText)) {
    return { status: "bad_request", message: "Missing required fields" }
  }

  if (plannedCookingDate && !normalizeMealDate(plannedCookingDate)) {
    return {
      status: "bad_request",
      message: "Invalid plannedCookingDate format",
    }
  }

  const cookingDate = normalizeMealDate(plannedCookingDate)
  let validatedEatingDates = normalizeMealDates(plannedEatingDates)
  if (validatedEatingDates.length === 0 && cookingDate) {
    validatedEatingDates = [cookingDate]
  }
  validatedEatingDates = clampEatingDatesToCooking(
    validatedEatingDates,
    cookingDate
  )

  const ingredientRows = normalizeMealIngredientInputs(foodItems)

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

  if (
    !defaultRoles ||
    !Array.isArray(defaultRoles) ||
    defaultRoles.length === 0
  ) {
    return {
      status: "bad_request",
      message: "defaultRoles must be a non-empty array",
    }
  }

  const invalidRoles = defaultRoles.filter(
    (role) => !VALID_ROLES.includes(role as MealRole)
  )
  if (invalidRoles.length > 0) {
    return {
      status: "bad_request",
      message: `Invalid roles found: ${invalidRoles.join(
        ", "
      )}. Allowed roles are: ${VALID_ROLES.join(", ")}`,
    }
  }

  const ownership = getDataOwnership(user)
  const meal = new Meal({
    name,
    recipe: recipeText,
    recipeSteps: steps,
    difficultyLevel,
    cookingTime,
    foodItems: ingredientRows,
    defaultRoles,
    mealCategory: normalizeMealCategories(mealCategory),
    plannedCookingDate: cookingDate,
    plannedEatingDates: validatedEatingDates,
    servings: normalizeServings(servings),
    user: ownership.userId,
    household: ownership.household,
    createdAt,
  })

  await meal.save()

  await User.findByIdAndUpdate(user._id, {
    $push: { meals: meal._id },
  })

  const populatedMeal = await Meal.findById(meal._id).populate(
    FOOD_ITEM_POPULATE
  )

  return {
    status: "ok",
    meal: flattenMealFoodItems(populatedMeal),
  }
}
