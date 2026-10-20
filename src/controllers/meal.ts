import { Response } from "express"
import type { Model } from "mongoose"
import fs from "fs"
import cloudinary from "../helpers/imageUpload"
import type { IMeal } from "../models/meal"
import type { IUserModel } from "../models/user"
import {
  AuthenticatedRequest,
  getErrorMessage,
  isCloudinaryConfigured,
  resolveModule,
} from "../helpers/controllerUtils"
import { getDataQuery } from "../helpers/householdHelpers"
import {
  flattenMealFoodItems,
  MEAL_FOOD_CATALOG_SELECT,
} from "../helpers/mealIngredients"
import {
  createMealForUser,
  type CreateMealInput,
} from "../services/mealCreate"
import { updateMealForUser } from "../services/mealUpdate"

const Meal = resolveModule<Model<IMeal>>(require("../models/meal"))
const User = resolveModule<IUserModel>(require("../models/user"))

const FOOD_ITEM_POPULATE = {
  path: "foodItems.foodId",
  select: MEAL_FOOD_CATALOG_SELECT,
}

type CreateMealBody = CreateMealInput

const mealAccessQuery = async (
  user: AuthenticatedRequest["user"],
  mealId: string
) => ({
  $and: [{ _id: mealId }, await getDataQuery(user, "user")],
})

export const createMeal = async (
  req: AuthenticatedRequest<Record<string, string>, unknown, CreateMealBody>,
  res: Response
) => {
  try {
    const result = await createMealForUser(req.user, req.body)
    if (result.status !== "ok") {
      return res.status(400).json({
        success: false,
        message: result.message,
      })
    }
    res.json({ success: true, meal: result.meal })
  } catch (error: unknown) {
    console.error("Error creating meal:", error)
    res.status(400).json({ success: false, error: getErrorMessage(error) })
  }
}

export const getMeals = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = await getDataQuery(req.user, "user")
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
    const result = await updateMealForUser(
      req.user,
      req.params.mealId,
      req.body
    )
    if (result.status === "not_found") {
      return res.status(404).json({
        success: false,
        message: result.message,
      })
    }
    if (result.status !== "ok") {
      return res.status(400).json({
        success: false,
        message: result.message,
      })
    }
    res.json({ success: true, meal: result.meal })
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
    const accessQuery = await mealAccessQuery(req.user, mealId)

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
    const meal = await Meal.findOne(await mealAccessQuery(req.user, mealId))

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
    const meal = await Meal.findOne(await mealAccessQuery(req.user, mealId))

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
