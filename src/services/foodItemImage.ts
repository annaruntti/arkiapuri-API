import fs from "fs"
import type { Model } from "mongoose"
import cloudinary from "../helpers/imageUpload"
import {
  isCloudinaryConfigured,
  resolveModule,
} from "../helpers/controllerUtils"
import type { IFoodItem } from "../models/foodItem"
import type { Types } from "mongoose"

const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))

interface CloudinaryUploadResult {
  secure_url: string
  public_id: string
}

export type FoodItemImageResult =
  | { status: "ok"; foodItem: IFoodItem | null }
  | { status: "bad_request" | "not_found" | "server_error"; message: string }

export const uploadFoodItemImageFile = async (
  userId: Types.ObjectId | string,
  foodItemId: string,
  file?: Express.Multer.File
): Promise<FoodItemImageResult> => {
  if (!file) {
    return { status: "bad_request", message: "No image file provided" }
  }

  const foodItem = await FoodItem.findOne({
    _id: foodItemId,
    user: userId,
  })

  if (!foodItem) {
    return {
      status: "not_found",
      message: "Food item not found or unauthorized",
    }
  }

  if (!isCloudinaryConfigured()) {
    return { status: "server_error", message: "Cloud storage not configured" }
  }

  try {
    const result: CloudinaryUploadResult = await cloudinary.uploader.upload(
      file.path,
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

    fs.unlinkSync(file.path)

    return { status: "ok", foodItem: updatedFoodItem }
  } catch (uploadError) {
    if (file.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path)
    }
    throw uploadError
  }
}

export const removeFoodItemImageFile = async (
  userId: Types.ObjectId | string,
  foodItemId: string
): Promise<FoodItemImageResult> => {
  const foodItem = await FoodItem.findOne({
    _id: foodItemId,
    user: userId,
  })

  if (!foodItem) {
    return {
      status: "not_found",
      message: "Food item not found or unauthorized",
    }
  }

  if (!foodItem.image?.publicId) {
    return { status: "bad_request", message: "No image to remove" }
  }

  if (!isCloudinaryConfigured()) {
    return { status: "server_error", message: "Cloud storage not configured" }
  }

  await cloudinary.uploader.destroy(foodItem.image.publicId)

  const updatedFoodItem = await FoodItem.findByIdAndUpdate(
    foodItemId,
    { $unset: { image: 1 } },
    { new: true }
  )

  return { status: "ok", foodItem: updatedFoodItem }
}
