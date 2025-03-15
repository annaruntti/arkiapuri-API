const FoodItem = require("../models/foodItem")
const User = require("../models/user")

exports.createFoodItem = async (req, res) => {
  try {
    const {
      name,
      category,
      quantity,
      price,
      calories,
      location,
      listId,
      expirationDate,
      unit,
      quantities: requestQuantities,
      locations,
    } = req.body

    const foodItem = new FoodItem({
      name,
      category,
      quantity,
      price,
      calories,
      user: req.user._id,
      location: location,
      listId: listId || null,
      expirationDate,
      locations: locations || ["meal"],
      quantities: {
        meal:
          location === "meal"
            ? parseFloat(quantity) || 0
            : parseFloat(requestQuantities?.meal) || 0,
        "shopping-list":
          location === "shopping-list"
            ? parseFloat(quantity) || 0
            : parseFloat(requestQuantities?.["shopping-list"]) || 0,
        pantry:
          location === "pantry"
            ? parseFloat(quantity) || 0
            : parseFloat(requestQuantities?.pantry) || 0,
      },
      unit,
    })

    await foodItem.save()

    // Add reference to user's foodItems
    await User.findByIdAndUpdate(req.user._id, {
      $push: { foodItems: foodItem._id },
    })

    res.json({ success: true, foodItem })
  } catch (error) {
    console.error("Error creating food item:", error)
    res.status(400).json({ success: false, error: error.message })
  }
}

exports.getFoodItems = async (req, res) => {
  try {
    const { location } = req.query
    const query = { user: req.user._id }

    // Filter by location if provided
    if (location) {
      query.location = location
    }

    const foodItems = await FoodItem.find(query)
    res.json({ success: true, foodItems })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
}

exports.getFoodItemById = async (req, res) => {
  try {
    const foodItem = await FoodItem.findById(req.params.id)
    res.json({ success: true, foodItem })
  } catch (error) {
    res.status(404).json({ success: false, error: error.message })
  }
}

exports.updateFoodItem = async (req, res) => {
  try {
    const foodItem = await FoodItem.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true }
    )

    if (!foodItem) {
      return res.status(404).json({
        success: false,
        message: "Food item not found or unauthorized",
      })
    }

    res.json({ success: true, foodItem })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
}

exports.deleteFoodItem = async (req, res) => {
  try {
    const foodItem = await FoodItem.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    })

    if (!foodItem) {
      return res.status(404).json({
        success: false,
        message: "Food item not found or unauthorized",
      })
    }

    // Remove reference from user's foodItems array
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { foodItems: req.params.id },
    })

    res.json({ success: true, message: "Food item deleted successfully" })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
}

// New helper method to move items between locations
exports.moveFoodItem = async (req, res) => {
  try {
    const { id } = req.params
    const { location, listId, expirationDate } = req.body

    const foodItem = await FoodItem.findOneAndUpdate(
      { _id: id, user: req.user._id },
      {
        location,
        listId: listId || null,
        expirationDate: location === "pantry" ? expirationDate : null,
      },
      { new: true }
    )

    if (!foodItem) {
      return res.status(404).json({
        success: false,
        message: "Food item not found or unauthorized",
      })
    }

    res.json({ success: true, foodItem })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
}

// When adding to meal plan
exports.addToMeal = async (req, res) => {
  try {
    const { foodItemId, quantity } = req.body

    const foodItem = await FoodItem.findById(foodItemId)
    if (!foodItem) {
      return res.status(404).json({
        success: false,
        message: "Food item not found",
      })
    }

    // Update meal quantity
    foodItem.quantities.meal += quantity
    await foodItem.save()

    res.json({ success: true, foodItem })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
}

// When adding to shopping list
exports.addToShoppingList = async (req, res) => {
  try {
    const { foodItemId, quantity } = req.body

    const foodItem = await FoodItem.findById(foodItemId)
    if (!foodItem) {
      return res.status(404).json({
        success: false,
        message: "Food item not found",
      })
    }

    // Update shopping list quantity
    foodItem.quantities["shopping-list"] += quantity
    await foodItem.save()

    res.json({ success: true, foodItem })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
}

// When moving from shopping list to pantry
exports.moveToShoppingListToPantry = async (req, res) => {
  try {
    const { foodItemId, quantity } = req.body

    const foodItem = await FoodItem.findById(foodItemId)
    if (!foodItem) {
      return res.status(404).json({
        success: false,
        message: "Food item not found",
      })
    }

    // Decrease shopping list quantity and increase pantry quantity
    foodItem.quantities["shopping-list"] -= quantity
    foodItem.quantities.pantry += quantity
    await foodItem.save()

    res.json({ success: true, foodItem })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
}

// Get food items by location
exports.getFoodItemsByLocation = async (req, res) => {
  try {
    const { location } = req.params

    const foodItems = await FoodItem.find({
      user: req.user._id,
      locations: location,
      [`quantities.${location}`]: { $gt: 0 },
    })

    res.json({ success: true, foodItems })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
}

exports.updateQuantity = async (req, res) => {
  try {
    const { foodItemId } = req.params
    const { location, quantity, action = "set" } = req.body

    if (!["meal", "shopping-list", "pantry"].includes(location)) {
      return res.status(400).json({
        success: false,
        message: "Invalid location",
      })
    }

    const foodItem = await FoodItem.findOne({
      _id: foodItemId,
      user: req.user._id,
    })

    if (!foodItem) {
      return res.status(400).json({
        success: false,
        message: "Food item not found",
      })
    }

    // Handle different quantity update actions
    switch (action) {
      case "add":
        foodItem.quantities[location] += quantity
        break
      case "subtract":
        foodItem.quantities[location] = Math.max(
          0,
          foodItem.quantities[location] - quantity
        )
        break
      case "set":
        foodItem.quantities[location] = Math.max(0, quantity)
        break
      default:
        return res.status(400).json({
          success: false,
          message: "Invalid action",
        })
    }

    await foodItem.save()

    res.json({
      success: true,
      foodItem,
      message: `Quantity ${action}ed in ${location}`,
    })
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    })
  }
}

// Route to move items between locations
exports.moveItem = async (req, res) => {
  try {
    const { foodItemId } = req.params
    const { fromLocation, toLocation, quantity } = req.body

    if (
      !["meal", "shopping-list", "pantry"].includes(fromLocation) ||
      !["meal", "shopping-list", "pantry"].includes(toLocation)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid location",
      })
    }

    const foodItem = await FoodItem.findOne({
      _id: foodItemId,
      user: req.user._id,
    })

    if (!foodItem) {
      return res.status(400).json({
        success: false,
        message: "Food item not found",
      })
    }

    // Check is there enough quantity in source location
    if (foodItem.quantities[fromLocation] < quantity) {
      return res.status(400).json({
        success: false,
        message: `Not enough quantity in ${fromLocation}`,
      })
    }

    // Move quantity between locations
    foodItem.quantities[fromLocation] -= quantity
    foodItem.quantities[toLocation] += quantity

    await foodItem.save()

    res.json({
      success: true,
      foodItem,
      message: `Moved ${quantity} from ${fromLocation} to ${toLocation}`,
    })
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    })
  }
}
