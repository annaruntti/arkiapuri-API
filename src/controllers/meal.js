const Meal = require("../models/meal")
const User = require("../models/user")
const FoodItem = require("../models/foodItem")

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
    const mealData = {
      name,
      recipe,
      difficultyLevel,
      cookingTime,
      foodItems,
      defaultRoles: defaultRoles,
      plannedCookingDate,
      user: req.user._id,
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

// Get all meals for the current user
exports.getMeals = async (req, res) => {
  try {
    const meals = await Meal.find({ user: req.user._id }).populate({
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
