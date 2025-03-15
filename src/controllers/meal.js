const Meal = require("../models/meal")
const User = require("../models/user")
const FoodItem = require("../models/foodItem")

exports.createMeal = async (req, res) => {
  try {
    const {
      id,
      name,
      recipe,
      difficultyLevel,
      cookingTime,
      foodItems,
      defaultRole,
      plannedCookingDate,
      createdAt,
    } = req.body

    // Validate required fields
    if (!id || !name || !recipe) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      })
    }

    // Validate date format
    if (!Date.parse(plannedCookingDate)) {
      return res.status(400).json({
        success: false,
        message: "Invalid plannedCookingDate format",
      })
    }

    // Validate foodItems and ensure they belong to the user
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

    const meal = new Meal({
      id,
      name,
      recipe,
      difficultyLevel,
      cookingTime,
      foodItems,
      defaultRole,
      plannedCookingDate,
      user: req.user._id,
      createdAt,
    })

    await meal.save()

    // Update user's meals array
    await User.findByIdAndUpdate(req.user._id, { $push: { meals: meal._id } })

    // Get the populated meal to return
    const populatedMeal = await Meal.findById(meal._id).populate({
      path: "foodItems",
      select:
        "name quantity unit category calories price location quantities locations",
    })

    res.json({ success: true, meal: populatedMeal })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
}

exports.getMeals = async (req, res) => {
  try {
    // Get meals with populated food items, sorted by creation date
    const meals = await Meal.find({ user: req.user._id })
      .populate({
        path: "foodItems",
        select:
          "name quantity unit category calories price location quantities locations",
      })
      .sort({ createdAt: -1 })

    res.json({ success: true, meals })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
}

exports.getMealById = async (req, res) => {
  try {
    const meal = await Meal.findById(req.params.id).populate({
      path: "foodItems",
      select:
        "name quantity unit category calories price location quantities locations",
    })

    if (!meal) {
      return res.status(404).json({
        success: false,
        message: "Meal not found",
      })
    }

    // Verify the meal belongs to the user
    if (meal.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to access this meal",
      })
    }

    res.json({ success: true, meal })
  } catch (error) {
    res.status(404).json({ success: false, error: error.message })
  }
}

exports.updateMeal = async (req, res) => {
  try {
    const { foodItems } = req.body

    if (foodItems) {
      // Validate that all food items belong to the user
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

    const meal = await Meal.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true }
    ).populate({
      path: "foodItems",
      select:
        "name quantity unit category calories price location quantities locations",
    })

    if (!meal) {
      return res.status(404).json({
        success: false,
        message: "Meal not found or you don't have permission",
      })
    }

    res.json({ success: true, meal })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
}

exports.deleteMeal = async (req, res) => {
  try {
    const meal = await Meal.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    })

    if (!meal) {
      return res.status(404).json({
        success: false,
        message: "Meal not found or you don't have permission",
      })
    }

    // Remove reference from user's meals array
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { meals: req.params.id },
    })

    res.json({ success: true, message: "Meal deleted successfully" })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
}
