import { Response } from "express"
import type { Model } from "mongoose"
import fs from "fs"
import cloudinary from "../helper/imageUpload"
import type { IFoodItem } from "../models/foodItem"
import type { IMeal, MealRole } from "../models/meal"
import type { IUserModel } from "../models/user"
import {
  AuthenticatedRequest,
  getErrorMessage,
  isCloudinaryConfigured,
  resolveModule,
} from "../helpers/controllerUtils"
import {
  getDataOwnership,
  getDataQuery,
} from "../helpers/householdHelpers"
import {
  flattenMealFoodItems,
  MEAL_FOOD_CATALOG_SELECT,
  normalizeMealIngredientInputs,
} from "../helpers/mealIngredients"

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

interface CreateMealBody {
  name?: string
  recipe?: string
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
  mealCategory?: IMeal["mealCategory"]
  plannedCookingDate?: string
  plannedEatingDates?: string[]
  createdAt?: string | Date
}

const mealAccessQuery = (user: AuthenticatedRequest["user"], mealId: string) => ({
  _id: mealId,
  ...getDataQuery(user, "user"),
})

const toUtcDayKey = (value?: string | Date | null): string | null => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

const hasEatingDateBeforeCooking = (
  eatingDates?: Array<string | Date>,
  cookingDate?: string | Date | null
): boolean => {
  const cookingKey = toUtcDayKey(cookingDate)
  if (!cookingKey || !Array.isArray(eatingDates) || eatingDates.length === 0) {
    return false
  }
  return eatingDates.some((date) => {
    const key = toUtcDayKey(date)
    return key !== null && key < cookingKey
  })
}

export const createMeal = async (
  req: AuthenticatedRequest<Record<string, string>, unknown, CreateMealBody>,
  res: Response
) => {
  try {
    const {
      name,
      recipe,
      difficultyLevel,
      cookingTime,
      foodItems,
      defaultRoles,
      mealCategory,
      plannedCookingDate,
      plannedEatingDates,
      createdAt,
    } = req.body

    if (!name || !recipe) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      })
    }

    if (plannedCookingDate && !Date.parse(plannedCookingDate)) {
      return res.status(400).json({
        success: false,
        message: "Invalid plannedCookingDate format",
      })
    }

    let validatedEatingDates: string[] = []
    if (Array.isArray(plannedEatingDates) && plannedEatingDates.length > 0) {
      validatedEatingDates = plannedEatingDates.filter(
        (date) => date && Date.parse(date)
      )
    }

    if (validatedEatingDates.length === 0 && plannedCookingDate) {
      validatedEatingDates = [plannedCookingDate]
    }

    if (hasEatingDateBeforeCooking(validatedEatingDates, plannedCookingDate)) {
      return res.status(400).json({
        success: false,
        message: "Eating dates cannot be before plannedCookingDate",
      })
    }

    const ingredientRows = normalizeMealIngredientInputs(foodItems)

    if (ingredientRows.length > 0) {
      const foodItemIds = ingredientRows.map((row) => row.foodId)
      const uniqueIds = [...new Set(foodItemIds)]
      const validFoodItems = await FoodItem.find({
        _id: { $in: uniqueIds },
      })

      if (validFoodItems.length !== uniqueIds.length) {
        return res.status(400).json({
          success: false,
          message: "Invalid food items",
        })
      }
    }

    if (
      !defaultRoles ||
      !Array.isArray(defaultRoles) ||
      defaultRoles.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "defaultRoles must be a non-empty array",
      })
    }

    const invalidRoles = defaultRoles.filter(
      (role) => !VALID_ROLES.includes(role as MealRole)
    )
    if (invalidRoles.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid roles found: ${invalidRoles.join(
          ", "
        )}. Allowed roles are: ${VALID_ROLES.join(", ")}`,
      })
    }

    const ownership = getDataOwnership(req.user)
    const meal = new Meal({
      name,
      recipe,
      difficultyLevel,
      cookingTime,
      foodItems: ingredientRows,
      defaultRoles,
      mealCategory,
      plannedCookingDate,
      plannedEatingDates: validatedEatingDates,
      user: ownership.userId,
      household: ownership.household,
      createdAt,
    })

    await meal.save()

    await User.findByIdAndUpdate(req.user._id, {
      $push: { meals: meal._id },
    })

    const populatedMeal = await Meal.findById(meal._id).populate(
      FOOD_ITEM_POPULATE
    )

    res.json({ success: true, meal: flattenMealFoodItems(populatedMeal) })
  } catch (error: unknown) {
    console.error("Error creating meal:", error)
    res.status(400).json({ success: false, error: getErrorMessage(error) })
  }
}

export const getMeals = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = getDataQuery(req.user, "user")
    const meals = await Meal.find(query).populate(FOOD_ITEM_POPULATE)
    res.json({
      success: true,
      meals: meals.map((meal) => flattenMealFoodItems(meal)),
    })
  } catch (error: unknown) {
    console.error("Error getting meals:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const updateMeal = async (
  req: AuthenticatedRequest<{ mealId: string }, unknown, CreateMealBody>,
  res: Response
) => {
  try {
    const { mealId } = req.params
    const updateData = { ...req.body }
    const accessQuery = mealAccessQuery(req.user, mealId)

    const meal = await Meal.findOne(accessQuery)
    if (!meal) {
      return res.status(404).json({
        success: false,
        message: "Meal not found or unauthorized",
      })
    }

    if (updateData.plannedEatingDates !== undefined) {
      if (Array.isArray(updateData.plannedEatingDates)) {
        const validDates = updateData.plannedEatingDates
          .filter((date) => date && Date.parse(date))
          .map((date) => {
            const normalizedDate = new Date(date)
            normalizedDate.setUTCHours(0, 0, 0, 0)
            return normalizedDate.toISOString()
          })

        updateData.plannedEatingDates = [...new Set(validDates)]

        if (updateData.plannedEatingDates.length === 0) {
          const cookingDate =
            updateData.plannedCookingDate || meal.plannedCookingDate
          if (cookingDate) {
            updateData.plannedEatingDates = [String(cookingDate)]
          }
        }
      }
    }

    if (
      updateData.plannedEatingDates !== undefined ||
      updateData.plannedCookingDate !== undefined
    ) {
      const nextCookingDate =
        updateData.plannedCookingDate !== undefined
          ? updateData.plannedCookingDate
          : meal.plannedCookingDate
      const nextEatingDates =
        updateData.plannedEatingDates !== undefined
          ? updateData.plannedEatingDates
          : meal.plannedEatingDates

      if (hasEatingDateBeforeCooking(nextEatingDates, nextCookingDate)) {
        return res.status(400).json({
          success: false,
          message: "Eating dates cannot be before plannedCookingDate",
        })
      }
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
          return res.status(400).json({
            success: false,
            message: "Invalid food items",
          })
        }
      }
      updateData.foodItems = ingredientRows as CreateMealBody["foodItems"]
    }

    const updatedMeal = await Meal.findOneAndUpdate(accessQuery, updateData, {
      new: true,
    }).populate(FOOD_ITEM_POPULATE)

    res.json({ success: true, meal: flattenMealFoodItems(updatedMeal) })
  } catch (error: unknown) {
    console.error("Error updating meal:", error)
    res.status(400).json({ success: false, error: getErrorMessage(error) })
  }
}

export const deleteMeal = async (
  req: AuthenticatedRequest<{ mealId: string }>,
  res: Response
) => {
  try {
    const { mealId } = req.params
    const accessQuery = mealAccessQuery(req.user, mealId)

    const meal = await Meal.findOne(accessQuery)
    if (!meal) {
      return res.status(404).json({
        success: false,
        message: "Meal not found or unauthorized",
      })
    }

    await Meal.findOneAndDelete(accessQuery)

    await User.findByIdAndUpdate(req.user._id, {
      $pull: { meals: meal._id },
    })

    res.json({ success: true, message: "Meal deleted successfully" })
  } catch (error: unknown) {
    console.error("Error deleting meal:", error)
    res.status(400).json({ success: false, error: getErrorMessage(error) })
  }
}

export const uploadMealImage = async (
  req: AuthenticatedRequest<{ mealId: string }> & {
    file?: Express.Multer.File
  },
  res: Response
) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided",
      })
    }

    const { mealId } = req.params
    const meal = await Meal.findOne(mealAccessQuery(req.user, mealId))

    if (!meal) {
      return res.status(404).json({
        success: false,
        message: "Meal not found or unauthorized",
      })
    }

    if (!isCloudinaryConfigured()) {
      return res.status(500).json({
        success: false,
        message: "Cloud storage not configured",
      })
    }

    try {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "meal-images",
        use_filename: true,
      })

      const updatedMeal = await Meal.findByIdAndUpdate(
        mealId,
        {
          image: {
            url: result.secure_url,
            publicId: result.public_id,
          },
        },
        { new: true }
      ).populate(FOOD_ITEM_POPULATE)

      fs.unlinkSync(req.file.path)

      res.json({ success: true, meal: flattenMealFoodItems(updatedMeal) })
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

export const removeMealImage = async (
  req: AuthenticatedRequest<{ mealId: string }>,
  res: Response
) => {
  try {
    const { mealId } = req.params
    const meal = await Meal.findOne(mealAccessQuery(req.user, mealId))

    if (!meal) {
      return res.status(404).json({
        success: false,
        message: "Meal not found or unauthorized",
      })
    }

    if (!meal.image?.publicId) {
      return res.status(400).json({
        success: false,
        message: "No image to remove",
      })
    }

    if (!isCloudinaryConfigured()) {
      return res.status(500).json({
        success: false,
        message: "Cloud storage not configured",
      })
    }

    try {
      await cloudinary.uploader.destroy(meal.image.publicId)

      const updatedMeal = await Meal.findByIdAndUpdate(
        mealId,
        { $unset: { image: 1 } },
        { new: true }
      ).populate(FOOD_ITEM_POPULATE)

      res.json({ success: true, meal: flattenMealFoodItems(updatedMeal) })
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
