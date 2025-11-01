const Meal = require("../models/meal")
const User = require("../models/user")
const FoodItem = require("../models/foodItem")
const cloudinary = require("../helper/imageUpload")
const fs = require("fs")
const {
  getDataOwnership,
  getDataQuery,
} = require("../helpers/householdHelpers")

exports.createMeal = async (req, res) => {
  try {
    const {
      name,
      recipe,
      difficultyLevel,
      cookingTime,
      foodItems,
      defaultRoles,
      plannedCookingDate,
      plannedEatingDates,
      createdAt,
    } = req.body

    // Validate required fields
    if (!name || !recipe) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      })
    }

    // Validate date format
    if (plannedCookingDate && !Date.parse(plannedCookingDate)) {
      return res.status(400).json({
        success: false,
        message: "Invalid plannedCookingDate format",
      })
    }

    // Validate plannedEatingDates if provided
    let validatedEatingDates = []
    if (
      plannedEatingDates &&
      Array.isArray(plannedEatingDates) &&
      plannedEatingDates.length > 0
    ) {
      validatedEatingDates = plannedEatingDates.filter(
        (date) => date && Date.parse(date)
      )
    }

    // If no eating dates provided, default to cooking date if available
    if (validatedEatingDates.length === 0 && plannedCookingDate) {
      validatedEatingDates = [plannedCookingDate]
    }

    // Validate foodItems and check are they belonging to the user
    if (foodItems && foodItems.length > 0) {
      const validFoodItems = await FoodItem.find({
        _id: { $in: foodItems },
        user: req.user._id,
      })

      if (validFoodItems.length !== foodItems.length) {
        return res.status(400).json({
          success: false,
          message: "Invalid food items or food items don't belong to user",
        })
      }
    }

    // DefaultRoles validation
    const validRoles = [
      "breakfast",
      "lunch",
      "snack",
      "dinner",
      "supper",
      "dessert",
      "other",
    ]

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

    // Validate is roles allowed
    const invalidRoles = defaultRoles.filter(
      (role) => !validRoles.includes(role)
    )
    if (invalidRoles.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid roles found: ${invalidRoles.join(
          ", "
        )}. Allowed roles are: ${validRoles.join(", ")}`,
      })
    }

    // Create meal data object
    const ownership = getDataOwnership(req.user)
    const mealData = {
      name,
      recipe,
      difficultyLevel,
      cookingTime,
      foodItems,
      defaultRoles: defaultRoles,
      plannedCookingDate,
      plannedEatingDates: validatedEatingDates,
      user: ownership.userId,
      household: ownership.household,
      createdAt,
    }

    const meal = new Meal(mealData)
    await meal.save()

    // Update user's meals array
    await User.findByIdAndUpdate(req.user._id, {
      $push: { meals: meal._id },
    })

    // Get the populated meal to return
    const populatedMeal = await Meal.findById(meal._id).populate({
      path: "foodItems",
      select:
        "name quantity unit category calories price location quantities locations",
    })

    res.json({ success: true, meal: populatedMeal })
  } catch (error) {
    console.error("Error creating meal:", error)
    res.status(400).json({ success: false, error: error.message })
  }
}

// Get all meals for the current user or household
exports.getMeals = async (req, res) => {
  try {
    const query = getDataQuery(req.user, "user")
    const meals = await Meal.find(query).populate({
      path: "foodItems",
      select:
        "name quantity unit category calories price location quantities locations",
    })
    res.json({ success: true, meals })
  } catch (error) {
    console.error("Error getting meals:", error)
    res.status(500).json({ success: false, error: error.message })
  }
}

// Update a meal
exports.updateMeal = async (req, res) => {
  try {
    const { mealId } = req.params
    const updateData = req.body

    // Find the meal and check if it belongs to the user
    const meal = await Meal.findOne({ _id: mealId, user: req.user._id })
    if (!meal) {
      return res.status(404).json({
        success: false,
        message: "Meal not found or unauthorized",
      })
    }

    // Validate and process plannedEatingDates if provided
    if (updateData.plannedEatingDates !== undefined) {
      if (Array.isArray(updateData.plannedEatingDates)) {
        // Filter out invalid dates and normalize them
        const validDates = updateData.plannedEatingDates
          .filter((date) => date && Date.parse(date))
          .map((date) => {
            // Normalize dates to start of day to avoid timezone issues
            const normalizedDate = new Date(date)
            normalizedDate.setUTCHours(0, 0, 0, 0)
            return normalizedDate.toISOString()
          })

        // Remove duplicates
        updateData.plannedEatingDates = [...new Set(validDates)]

        // If no eating dates after validation, default to cooking date
        if (updateData.plannedEatingDates.length === 0) {
          const cookingDate =
            updateData.plannedCookingDate || meal.plannedCookingDate
          if (cookingDate) {
            updateData.plannedEatingDates = [cookingDate]
          }
        }
      }
    }

    // Update the meal
    const updatedMeal = await Meal.findOneAndUpdate(
      { _id: mealId, user: req.user._id },
      updateData,
      { new: true }
    ).populate({
      path: "foodItems",
      select:
        "name quantity unit category calories price location quantities locations",
    })

    res.json({ success: true, meal: updatedMeal })
  } catch (error) {
    console.error("Error updating meal:", error)
    res.status(400).json({ success: false, error: error.message })
  }
}

// Delete a meal
exports.deleteMeal = async (req, res) => {
  try {
    const { mealId } = req.params

    // Find the meal and check if it belongs to the user
    const meal = await Meal.findOne({ _id: mealId, user: req.user._id })
    if (!meal) {
      return res.status(404).json({
        success: false,
        message: "Meal not found or unauthorized",
      })
    }

    // Delete the meal
    await Meal.findOneAndDelete({ _id: mealId, user: req.user._id })

    // Remove the meal from the user's meals array
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { meals: meal._id },
    })

    res.json({ success: true, message: "Meal deleted successfully" })
  } catch (error) {
    console.error("Error deleting meal:", error)
    res.status(400).json({ success: false, error: error.message })
  }
}

// Upload meal image
exports.uploadMealImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided",
      })
    }

    const { mealId } = req.params

    // Find the meal and check if it belongs to the user
    const meal = await Meal.findOne({ _id: mealId, user: req.user._id })
    if (!meal) {
      return res.status(404).json({
        success: false,
        message: "Meal not found or unauthorized",
      })
    }

    // Check Cloudinary credentials
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
      // Upload to Cloudinary
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "meal-images",
        use_filename: true,
      })

      // Update meal with image
      const updatedMeal = await Meal.findByIdAndUpdate(
        mealId,
        {
          image: {
            url: result.secure_url,
            publicId: result.public_id,
          },
        },
        { new: true }
      ).populate({
        path: "foodItems",
        select:
          "name quantity unit category calories price location quantities locations",
      })

      // Clean up the uploaded file
      fs.unlinkSync(req.file.path)

      res.json({
        success: true,
        meal: updatedMeal,
      })
    } catch (uploadError) {
      // Clean up the uploaded file in case of error
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path)
      }
      throw uploadError
    }
  } catch (error) {
    console.error("Upload error:", error)
    res.status(500).json({
      success: false,
      message: "Image upload failed",
      error: error.message,
    })
  }
}

// Remove meal image
exports.removeMealImage = async (req, res) => {
  try {
    const { mealId } = req.params

    // Find the meal and check if it belongs to the user
    const meal = await Meal.findOne({ _id: mealId, user: req.user._id })
    if (!meal) {
      return res.status(404).json({
        success: false,
        message: "Meal not found or unauthorized",
      })
    }

    // Check if meal has an image
    if (!meal.image || !meal.image.publicId) {
      return res.status(400).json({
        success: false,
        message: "No image to remove",
      })
    }

    // Check Cloudinary credentials
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
      // Delete from Cloudinary
      await cloudinary.uploader.destroy(meal.image.publicId)

      // Update meal to remove image
      const updatedMeal = await Meal.findByIdAndUpdate(
        mealId,
        {
          $unset: { image: 1 },
        },
        { new: true }
      ).populate({
        path: "foodItems",
        select:
          "name quantity unit category calories price location quantities locations",
      })

      res.json({
        success: true,
        meal: updatedMeal,
      })
    } catch (deleteError) {
      console.error("Error deleting from Cloudinary:", deleteError)
      throw deleteError
    }
  } catch (error) {
    console.error("Remove image error:", error)
    res.status(500).json({
      success: false,
      message: "Image removal failed",
      error: error.message,
    })
  }
}
