const Pantry = require("../models/pantry")

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

exports.getPantry = async (req, res) => {
  try {
    let pantry = await Pantry.findOne({ userId: req.user._id })
    if (!pantry) {
      pantry = new Pantry({ userId: req.user._id, items: [] })
      await pantry.save()
    }

    // Get expiring items
    const expiringItems = pantry.getExpiringItems(7)

    res.json({
      success: true,
      pantry,
      expiringItems: expiringItems.length > 0 ? expiringItems : null,
    })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
}

exports.addPantryItem = async (req, res) => {
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

exports.addItemsToPantry = async (req, res) => {
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

exports.updatePantryItem = async (req, res) => {
  try {
    const { itemId } = req.params
    const update = req.body

    // Validate update data
    const errors = validateItemData(update)
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
      })
    }

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

    // Update fields
    Object.assign(item, update)

    // Remove if quantity is 0
    if (item.quantity <= 0) {
      pantry.items.pull(itemId)
    }

    await pantry.save()
    res.json({
      success: true,
      pantry,
      removed: item.quantity <= 0,
    })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
}

exports.removePantryItem = async (req, res) => {
  try {
    const { itemId } = req.params

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

    pantry.items.pull(itemId)
    await pantry.save()

    res.json({
      success: true,
      message: "Item removed from pantry",
      removedItem: item,
    })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
}
