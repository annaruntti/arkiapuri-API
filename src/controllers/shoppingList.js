const ShoppingList = require("../models/shoppingList")
const Pantry = require("../models/pantry")

exports.createShoppingList = async (req, res) => {
  try {
    const { name, items } = req.body

    const shoppingList = new ShoppingList({
      userId: req.user._id,
      name,
      items,
    })

    await shoppingList.save()
    res.json({ success: true, shoppingList })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
}

exports.getShoppingLists = async (req, res) => {
  try {
    const shoppingLists = await ShoppingList.find({ userId: req.user._id })
    res.json({ success: true, shoppingLists })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
}

exports.updateShoppingList = async (req, res) => {
  try {
    const { id } = req.params
    const update = req.body

    const shoppingList = await ShoppingList.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      update,
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

    // Find the shopping list and item
    const shoppingList = await ShoppingList.findOne({
      _id: listId,
      userId: req.user._id,
      "items._id": itemId,
    })

    if (!shoppingList) {
      return res.status(404).json({
        success: false,
        message: "Shopping list or item not found",
      })
    }

    // Find the item in the shopping list
    const item = shoppingList.items.id(itemId)
    item.bought = true

    // Add item to pantry
    let pantry = await Pantry.findOne({ userId: req.user._id })
    if (!pantry) {
      pantry = new Pantry({ userId: req.user._id, items: [] })
    }

    pantry.items.push({
      foodId: item.foodId,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      expirationDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default 7 days expiration
    })

    // Save both documents
    await Promise.all([shoppingList.save(), pantry.save()])

    res.json({
      success: true,
      message: "Item marked as bought and added to pantry",
      shoppingList,
      pantry,
    })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
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
