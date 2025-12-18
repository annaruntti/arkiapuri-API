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

// Find or create food item with name matching (fuzzy matching)
exports.findOrCreateFoodItem = async (req, res) => {
  try {
    const { name, category, unit, price, calories, location, quantities } =
      req.body

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Food item name is required",
      })
    }

    // Normalize name for comparison (lowercase, trim, remove extra spaces)
    const normalizeName = (str) =>
      str
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[^\w\s]/g, "")

    const normalizedSearchName = normalizeName(name)

    // First try exact match (case-insensitive)
    let existingFoodItem = await FoodItem.findOne({
      user: req.user._id,
      $expr: {
        $eq: [
          { $toLower: { $trim: { input: "$name" } } },
          normalizedSearchName,
        ],
      },
    })

    // If no exact match, try fuzzy matching (similar names)
    if (!existingFoodItem) {
      const allFoodItems = await FoodItem.find({ user: req.user._id })
      const threshold = 0.8 // 80% similarity threshold

      // Simple Levenshtein-like similarity check
      const calculateSimilarity = (str1, str2) => {
        const longer = str1.length > str2.length ? str1 : str2
        const shorter = str1.length > str2.length ? str2 : str1
        if (longer.length === 0) return 1.0

        // Check if one string contains the other
        if (longer.includes(shorter)) return 0.9

        // Simple character-based similarity
        let matches = 0
        for (let i = 0; i < shorter.length; i++) {
          if (longer.includes(shorter[i])) matches++
        }
        return matches / longer.length
      }

      for (const item of allFoodItems) {
        const normalizedItemName = normalizeName(item.name)
        const similarity = calculateSimilarity(
          normalizedSearchName,
          normalizedItemName
        )

        if (similarity >= threshold) {
          existingFoodItem = item
          break
        }
      }
    }

    // If found existing item, update it and return
    if (existingFoodItem) {
      // Update quantities if provided
      if (quantities) {
        Object.keys(quantities).forEach((loc) => {
          if (["meal", "shopping-list", "pantry"].includes(loc)) {
            existingFoodItem.quantities[loc] =
              (existingFoodItem.quantities[loc] || 0) +
              (parseFloat(quantities[loc]) || 0)
          }
        })
      }

      // Update other fields if provided (merge, don't overwrite)
      if (category && Array.isArray(category)) {
        existingFoodItem.category = [
          ...new Set([...existingFoodItem.category, ...category]),
        ]
      }
      if (unit) existingFoodItem.unit = unit
      if (price !== undefined && price > 0) {
        existingFoodItem.price =
          existingFoodItem.price && existingFoodItem.price > 0
            ? (existingFoodItem.price + price) / 2
            : price
      }
      if (calories !== undefined && calories > 0) {
        existingFoodItem.calories =
          existingFoodItem.calories && existingFoodItem.calories > 0
            ? (existingFoodItem.calories + calories) / 2
            : calories
      }

      // Update locations
      if (location && !existingFoodItem.locations.includes(location)) {
        existingFoodItem.locations.push(location)
      }

      await existingFoodItem.save()

      return res.json({
        success: true,
        foodItem: existingFoodItem,
        isExisting: true,
        message: "Found existing food item and updated",
      })
    }

    // Create new food item if not found
    const foodItem = new FoodItem({
      name,
      category: category || [],
      unit: unit || "kpl",
      price: price || 0,
      calories: calories || 0,
      user: req.user._id,
      locations: location ? [location] : ["meal"],
      quantities: quantities || {
        meal: location === "meal" ? 1 : 0,
        "shopping-list": location === "shopping-list" ? 1 : 0,
        pantry: location === "pantry" ? 1 : 0,
      },
    })

    await foodItem.save()

    // Add reference to user's foodItems
    await User.findByIdAndUpdate(req.user._id, {
      $push: { foodItems: foodItem._id },
    })

    return res.json({
      success: true,
      foodItem,
      isExisting: false,
      message: "Created new food item",
    })
  } catch (error) {
    console.error("Error in findOrCreateFoodItem:", error)
    res.status(400).json({
      success: false,
      error: error.message,
    })
  }
}

// Check if food item exists in pantry or shopping list
exports.checkItemAvailability = async (req, res) => {
  try {
    const { name } = req.body

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Food item name is required",
      })
    }

    // Normalize name for comparison
    const normalizeName = (str) =>
      str
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[^\w\s]/g, "")

    const normalizedSearchName = normalizeName(name)

    // Find food items with similar names
    const allFoodItems = await FoodItem.find({ user: req.user._id })
    const matchingItems = []

    for (const item of allFoodItems) {
      const normalizedItemName = normalizeName(item.name)
      // Check exact match or if one contains the other
      if (
        normalizedItemName === normalizedSearchName ||
        normalizedItemName.includes(normalizedSearchName) ||
        normalizedSearchName.includes(normalizedItemName)
      ) {
        matchingItems.push(item)
      }
    }

    // Check pantry
    const Pantry = require("../models/pantry")
    const pantry = await Pantry.findOne({
      userId: req.user._id,
    }).populate("items.foodId")

    let inPantry = false
    let pantryQuantity = 0
    if (pantry && pantry.items) {
      for (const pantryItem of pantry.items) {
        if (pantryItem.foodId) {
          const pantryItemName = normalizeName(pantryItem.foodId.name)
          if (
            pantryItemName === normalizedSearchName ||
            pantryItemName.includes(normalizedSearchName) ||
            normalizedSearchName.includes(pantryItemName)
          ) {
            inPantry = true
            pantryQuantity = pantryItem.quantity || 0
            break
          }
        } else if (pantryItem.name) {
          const pantryItemName = normalizeName(pantryItem.name)
          if (
            pantryItemName === normalizedSearchName ||
            pantryItemName.includes(normalizedSearchName) ||
            normalizedSearchName.includes(pantryItemName)
          ) {
            inPantry = true
            pantryQuantity = pantryItem.quantity || 0
            break
          }
        }
      }
    }

    // Check shopping lists
    const ShoppingList = require("../models/shoppingList")
    const shoppingLists = await ShoppingList.find({
      userId: req.user._id,
    }).populate("items.foodId")

    let inShoppingList = false
    let shoppingListQuantity = 0
    let shoppingListId = null
    for (const list of shoppingLists) {
      if (list.items) {
        for (const listItem of list.items) {
          if (listItem.foodId) {
            const listItemName = normalizeName(listItem.foodId.name)
            if (
              listItemName === normalizedSearchName ||
              listItemName.includes(normalizedSearchName) ||
              normalizedSearchName.includes(listItemName)
            ) {
              inShoppingList = true
              shoppingListQuantity = listItem.quantity || 0
              shoppingListId = list._id
              break
            }
          } else if (listItem.name) {
            const listItemName = normalizeName(listItem.name)
            if (
              listItemName === normalizedSearchName ||
              listItemName.includes(normalizedSearchName) ||
              normalizedSearchName.includes(listItemName)
            ) {
              inShoppingList = true
              shoppingListQuantity = listItem.quantity || 0
              shoppingListId = list._id
              break
            }
          }
        }
        if (inShoppingList) break
      }
    }

    res.json({
      success: true,
      inPantry,
      pantryQuantity,
      inShoppingList,
      shoppingListQuantity,
      shoppingListId,
      hasMatchingFoodItem: matchingItems.length > 0,
      matchingFoodItems: matchingItems.map((item) => ({
        _id: item._id,
        name: item.name,
        quantities: item.quantities,
      })),
    })
  } catch (error) {
    console.error("Error checking item availability:", error)
    res.status(500).json({
      success: false,
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
