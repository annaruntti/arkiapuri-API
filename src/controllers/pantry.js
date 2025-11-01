const Pantry = require("../models/pantry")
const FoodItem = require("../models/foodItem")
const {
  getDataOwnership,
  getDataQuery,
} = require("../helpers/householdHelpers")

// Helper function to validate item data
const validateItemData = (item) => {
  const errors = []

  if (
    !item.name ||
    typeof item.name !== "string" ||
    item.name.trim().length === 0
  ) {
    errors.push("Valid item name is required")
  }

  if (item.quantity && (isNaN(item.quantity) || item.quantity < 0)) {
    errors.push("Quantity must be a positive number")
  }

  if (item.expirationDate && isNaN(new Date(item.expirationDate).getTime())) {
    errors.push("Valid expiration date is required")
  }

  return errors
}

// Get pantry
const getPantry = async (req, res) => {
  try {
    const query = getDataQuery(req.user)
    let pantry = await Pantry.findOne(query).populate({
      path: "items.foodId",
      // Select all fields to ensure image is included
    })

    if (!pantry) {
      const ownership = getDataOwnership(req.user)
      pantry = new Pantry({ ...ownership, items: [] })
      await pantry.save()
    }

    // Merge food item data with pantry items
    const processedItems = pantry.items.map((item) => {
      const foodItemData = item.foodId || {}
      return {
        ...item.toObject(),
        category: foodItemData.category || item.category || [],
        unit: foodItemData.unit || item.unit || "kpl",
        calories: foodItemData.calories || item.calories || 0,
        price: foodItemData.price || item.price || 0,
        image: foodItemData.image || item.image || null,
      }
    })

    res.json({
      success: true,
      pantry: {
        ...pantry.toObject(),
        items: processedItems,
      },
    })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
}

// Add food item to pantry
const addFoodItemToPantry = async (req, res) => {
  try {
    const {
      name,
      category,
      quantity,
      unit,
      price,
      calories,
      expirationDate,
      quantities,
    } = req.body

    // Create or update food item
    let foodItem = await FoodItem.findOne({
      name: name.trim().toLowerCase(),
      user: req.user._id,
    })

    if (!foodItem) {
      foodItem = new FoodItem({
        name,
        category,
        quantity: parseFloat(quantity) || 1,
        unit,
        price,
        calories,
        user: req.user._id,
        location: "pantry",
        quantities: quantities || {
          meal: 0,
          "shopping-list": 0,
          pantry: parseFloat(quantity) || 1,
        },
      })
      await foodItem.save()
    } else {
      foodItem.category = category
      foodItem.unit = unit
      foodItem.price = price
      foodItem.calories = calories
      foodItem.location = "pantry"
      if (quantities) {
        foodItem.quantities = quantities
      } else {
        foodItem.quantities.pantry =
          (foodItem.quantities.pantry || 0) + (parseFloat(quantity) || 1)
      }
      await foodItem.save()
    }

    let pantry = await Pantry.findOne({ userId: req.user._id })
    if (!pantry) {
      pantry = new Pantry({ userId: req.user._id, items: [] })
    }

    const existingItem = pantry.items.find(
      (item) => item.foodId?.toString() === foodItem._id.toString()
    )

    if (existingItem) {
      // Update existing pantry item
      existingItem.quantity += parseFloat(quantity) || 1
      existingItem.unit = foodItem.unit
      existingItem.category = foodItem.category
      existingItem.calories = foodItem.calories
      existingItem.price = foodItem.price
      if (expirationDate) {
        existingItem.expirationDate = expirationDate
      }
    } else {
      // Add new pantry item with all fields
      pantry.items.push({
        foodId: foodItem._id,
        name: foodItem.name,
        quantity: parseFloat(quantity) || 1,
        unit: foodItem.unit,
        category: foodItem.category,
        calories: foodItem.calories,
        price: foodItem.price,
        expirationDate:
          expirationDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
    }

    await pantry.save()

    res.json({
      success: true,
      pantry,
      foodItem,
    })
  } catch (error) {
    console.error("Error in addFoodItemToPantry:", error)
    res.status(400).json({ success: false, error: error.message })
  }
}

// Update pantry item
const updatePantryItem = async (req, res) => {
  try {
    const { itemId } = req.params
    const update = req.body

    const pantry = await Pantry.findOne({ userId: req.user._id })
    if (!pantry) {
      return res.status(404).json({
        success: false,
        message: "Pantry not found",
      })
    }

    const item = pantry.items.id(itemId)
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found in pantry",
      })
    }

    // Handle foodId reference separately to avoid overwriting the reference
    if (
      update.foodId &&
      typeof update.foodId === "object" &&
      update.foodId._id
    ) {
      // If foodId is an object with _id, store only the _id reference
      item.foodId = update.foodId._id
      // Remove foodId from update to avoid overwriting
      delete update.foodId
    }

    // Remove image from update as it's not part of the pantry item schema
    // Image is stored in FoodItem and fetched through population
    if (update.image) {
      delete update.image
    }

    Object.assign(item, update)
    await pantry.save()

    // Also update the corresponding FoodItem if it exists
    if (item.foodId) {
      const foodItemUpdate = {}

      // Update fields that should be synced between pantry item and food item
      if (update.category !== undefined) {
        // Ensure categories are stored as strings (convert numbers to strings)
        foodItemUpdate.category = Array.isArray(update.category)
          ? update.category.map((cat) => String(cat))
          : []
      }
      if (update.name !== undefined) {
        foodItemUpdate.name = update.name
      }
      if (update.unit !== undefined) {
        foodItemUpdate.unit = update.unit
      }
      if (update.price !== undefined) {
        foodItemUpdate.price = update.price
      }
      if (update.calories !== undefined) {
        foodItemUpdate.calories = update.calories
      }

      // Only update if there are fields to update
      if (Object.keys(foodItemUpdate).length > 0) {
        // Get the actual ObjectId (item.foodId might be populated or just an ID)
        const foodItemId = item.foodId._id || item.foodId

        await FoodItem.findByIdAndUpdate(foodItemId, foodItemUpdate, {
          new: true,
        })
      }
    }

    // Repopulate the pantry to get updated foodId data
    await pantry.populate({
      path: "items.foodId",
      // Select all fields to ensure image is included
    })

    res.json({ success: true, pantry })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
}

// Remove pantry item
const removePantryItem = async (req, res) => {
  try {
    const { itemId } = req.params

    const pantry = await Pantry.findOne({ userId: req.user._id })
    if (!pantry) {
      return res.status(404).json({
        success: false,
        message: "Pantry not found",
      })
    }

    pantry.items.pull(itemId)
    await pantry.save()

    res.json({ success: true, message: "Item removed from pantry" })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
}

// Move items from shopping list to pantry
const moveToPantry = async (req, res) => {
  try {
    res.status(200).json({ message: "Items moved to pantry successfully" })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

const addPantryItem = async (req, res) => {
  try {
    const itemData = req.body

    // Validate input
    const errors = validateItemData(itemData)
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
      })
    }

    let pantry = await Pantry.findOne({ userId: req.user._id })
    if (!pantry) {
      pantry = new Pantry({ userId: req.user._id, items: [] })
    }

    // Check for existing item
    const existingItem = pantry.findItem(itemData.name)

    if (existingItem) {
      existingItem.quantity += itemData.quantity || 1
      if (itemData.expirationDate) {
        // Update expiration date if new date is later
        const newDate = new Date(itemData.expirationDate)
        if (newDate > existingItem.expirationDate) {
          existingItem.expirationDate = newDate
        }
      }
    } else {
      pantry.items.push({
        ...itemData,
        addedFrom: "pantry",
      })
    }

    await pantry.save()
    res.json({ success: true, pantry })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
}

const addItemsToPantry = async (req, res) => {
  try {
    const { items } = req.body

    // Validate all items
    const errors = items.reduce((acc, item, index) => {
      const itemErrors = validateItemData(item)
      if (itemErrors.length > 0) {
        acc[`item${index + 1}`] = itemErrors
      }
      return acc
    }, {})

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        errors,
      })
    }

    let pantry = await Pantry.findOne({ userId: req.user._id })
    if (!pantry) {
      pantry = new Pantry({
        userId: req.user._id,
        items: [],
      })
    }

    // Process each item
    const processedItems = []
    const updatedItems = []

    items.forEach((item) => {
      const existingItem = pantry.findItem(item.name)

      if (existingItem) {
        existingItem.quantity += item.quantity || 1
        if (item.expirationDate) {
          const newDate = new Date(item.expirationDate)
          if (newDate > existingItem.expirationDate) {
            existingItem.expirationDate = newDate
          }
        }
        updatedItems.push(existingItem)
      } else {
        const newItem = {
          ...item,
          addedFrom: "shopping-list",
        }
        pantry.items.push(newItem)
        processedItems.push(newItem)
      }
    })

    await pantry.save()

    res.json({
      success: true,
      pantry,
      summary: {
        added: processedItems.length,
        updated: updatedItems.length,
      },
    })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
}

module.exports = {
  getPantry,
  addFoodItemToPantry,
  updatePantryItem,
  removePantryItem,
  moveToPantry,
  addPantryItem,
  addItemsToPantry,
}
