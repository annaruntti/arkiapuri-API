const FoodItem = require("../models/foodItem")
const User = require("../models/user")
const cloudinary = require("../helper/imageUpload")
const fs = require("fs")

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

// Upload food item image
exports.uploadFoodItemImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided",
      })
    }

    const { foodItemId } = req.params

    // Find the food item and check if it belongs to the user
    const foodItem = await FoodItem.findOne({
      _id: foodItemId,
      user: req.user._id,
    })

    if (!foodItem) {
      // Check if food item exists at all
      const anyFoodItem = await FoodItem.findById(foodItemId)
      console.log("Food item exists in DB:", !!anyFoodItem)
      if (anyFoodItem) {
        console.log("Food item belongs to user:", anyFoodItem.user.toString())
        console.log("Current user:", req.user._id.toString())
      }

      return res.status(404).json({
        success: false,
        message: "Food item not found or unauthorized",
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
        folder: "food-item-images",
        use_filename: true,
      })

      // Update food item with image
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

      // Clean up the uploaded file
      fs.unlinkSync(req.file.path)

      res.json({
        success: true,
        foodItem: updatedFoodItem,
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

// Remove food item image
exports.removeFoodItemImage = async (req, res) => {
  try {
    const { foodItemId } = req.params

    // Find the food item and check if it belongs to the user
    const foodItem = await FoodItem.findOne({
      _id: foodItemId,
      user: req.user._id,
    })
    if (!foodItem) {
      return res.status(404).json({
        success: false,
        message: "Food item not found or unauthorized",
      })
    }

    // Check if food item has an image
    if (!foodItem.image || !foodItem.image.publicId) {
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
      await cloudinary.uploader.destroy(foodItem.image.publicId)

      // Update food item to remove image
      const updatedFoodItem = await FoodItem.findByIdAndUpdate(
        foodItemId,
        {
          $unset: { image: 1 },
        },
        { new: true }
      )

      res.json({
        success: true,
        foodItem: updatedFoodItem,
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
