const ShoppingList = require("../models/shoppingList")
const Pantry = require("../models/pantry")
const FoodItem = require("../models/foodItem")

exports.createShoppingList = async (req, res) => {
  try {
    const { name, description, items, totalEstimatedPrice } = req.body

    const shoppingList = new ShoppingList({
      userId: req.user._id,
      name,
      description,
      items: items.map((item) => ({
        _id: item._id,
        foodId: item.foodId || item._id,
        name: item.name,
        estimatedPrice: item.estimatedPrice,
        quantity: item.quantity || 1,
        unit: item.unit,
        category: item.category || item.categories,
        calories: item.calories,
        price: item.price,
        bought: false,
      })),
      totalEstimatedPrice,
    })

    await shoppingList.save()
    res.json({ success: true, shoppingList })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
}

exports.getShoppingLists = async (req, res) => {
  try {
    const shoppingLists = await ShoppingList.find({
      userId: req.user._id,
    }).sort({ createdAt: -1 }) // Most recent first
    res.json({ success: true, shoppingLists })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
}

exports.updateShoppingList = async (req, res) => {
  try {
    const { id } = req.params
    const { items, totalEstimatedPrice } = req.body

    const shoppingList = await ShoppingList.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      {
        items,
        totalEstimatedPrice,
      },
      { new: true }
    )

    if (!shoppingList) {
      return res.status(404).json({
        success: false,
        message: "Shopping list not found or unauthorized",
      })
    }

    res.json({ success: true, shoppingList })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
}

exports.markItemAsBought = async (req, res) => {
  try {
    const { listId, itemId } = req.params
    console.log("Marking item as bought:", { listId, itemId })

    // Find the shopping list
    const shoppingList = await ShoppingList.findOne({
      _id: listId,
      userId: req.user._id,
    })

    if (!shoppingList) {
      console.log("Shopping list not found:", listId)
      return res.status(404).json({
        success: false,
        message: "Shopping list not found",
      })
    }

    // Find the item in the shopping list
    const itemIndex = shoppingList.items.findIndex(
      (item) => item._id.toString() === itemId
    )

    if (itemIndex === -1) {
      console.log("Item not found in list:", itemId)
      return res.status(404).json({
        success: false,
        message: "Item not found in shopping list",
      })
    }

    const item = shoppingList.items[itemIndex]
    console.log("Found item:", item)

    // Mark item as bought
    item.bought = true

    // Find or create pantry
    let pantry = await Pantry.findOne({ userId: req.user._id })
    if (!pantry) {
      console.log("Creating new pantry for user")
      pantry = new Pantry({ userId: req.user._id, items: [] })
    }

    // Add to pantry
    const pantryItem = {
      foodId: item.foodId || item._id, // Use existing foodId or item._id
      name: item.name,
      quantity: item.quantity || 1,
      unit: item.unit || "kpl",
      expirationDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      category: item.category || [],
      calories: item.calories || 0,
      price: item.price || item.estimatedPrice || 0,
      addedFrom: "shopping-list",
    }

    console.log("Adding to pantry:", pantryItem)
    pantry.items.push(pantryItem)

    // Save both documents
    try {
      await Promise.all([shoppingList.save(), pantry.save()])
      console.log("Successfully saved both documents")
    } catch (saveError) {
      console.error("Error saving documents:", saveError)
      throw saveError
    }

    res.json({
      success: true,
      message: "Item marked as bought and added to pantry",
      shoppingList,
      pantry,
    })
  } catch (error) {
    console.error("Error in markItemAsBought:", error)
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
    })
  }
}

exports.deleteShoppingList = async (req, res) => {
  try {
    const { id } = req.params

    const shoppingList = await ShoppingList.findOneAndDelete({
      _id: id,
      userId: req.user._id,
    })

    if (!shoppingList) {
      return res.status(404).json({
        success: false,
        message: "Shopping list not found or unauthorized",
      })
    }

    res.json({ success: true, message: "Shopping list deleted successfully" })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
}
