const ShoppingList = require("../models/shoppingList")
const Pantry = require("../models/pantry")
const FoodItem = require("../models/foodItem")
const {
  getDataOwnership,
  getDataQuery,
} = require("../helpers/householdHelpers")

exports.createShoppingList = async (req, res) => {
  try {
    const { name, description, items, totalEstimatedPrice } = req.body

    // Log incoming items to debug

    const ownership = getDataOwnership(req.user)
    const shoppingList = new ShoppingList({
      userId: ownership.userId,
      household: ownership.household,
      name,
      description,
      items: items.map((item) => {
        // Set quantities based on location
        const parsedQuantity =
          typeof item.quantity === "number"
            ? item.quantity
            : parseFloat(item.quantity) || 1

        const quantities = {
          meal: 0,
          "shopping-list":
            item.location === "shopping-list" ? parsedQuantity : 0,
          pantry: item.location === "pantry" ? parsedQuantity : 0,
        }

        return {
          _id: item._id,
          foodId: item.foodId || item._id,
          name: item.name,
          estimatedPrice: item.estimatedPrice,
          quantity: parsedQuantity,
          quantities: quantities,
          unit: item.unit,
          category: item.category || item.categories,
          calories: item.calories,
          price: item.price,
          bought: false,
        }
      }),
      totalEstimatedPrice,
    })

    await shoppingList.save()

    res.json({ success: true, shoppingList })
  } catch (error) {
    console.error("Error creating shopping list:", error)
    res.status(400).json({ success: false, error: error.message })
  }
}

exports.getShoppingLists = async (req, res) => {
  try {
    const query = getDataQuery(req.user)
    const shoppingLists = await ShoppingList.find(query)
      .populate({
        path: "items.foodId",
        select: "name category unit calories price image",
      })
      .sort({ createdAt: -1 }) // Most recent first

    // Merge foodId data into items for easier access
    const processedLists = shoppingLists.map((list) => {
      const listObj = list.toObject()
      listObj.items = listObj.items.map((item) => {
        if (item.foodId && typeof item.foodId === "object") {
          // Merge foodId data, but keep item's own data as priority
          return {
            ...item,
            image: item.foodId.image || item.image,
            category: item.category || item.foodId.category,
          }
        }
        return item
      })
      return listObj
    })

    res.json({ success: true, shoppingLists: processedLists })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
}

exports.updateShoppingList = async (req, res) => {
  try {
    const { id } = req.params
    const { items, totalEstimatedPrice } = req.body

    // First, update the shopping list
    await ShoppingList.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      {
        items,
        totalEstimatedPrice,
      },
      { new: true }
    )

    // Then fetch it again with populate (this is more reliable for nested refs)
    const shoppingList = await ShoppingList.findOne({
      _id: id,
      userId: req.user._id,
    }).populate({
      path: "items.foodId",
      select: "name category unit calories price image",
    })

    if (!shoppingList) {
      return res.status(404).json({
        success: false,
        message: "Shopping list not found or unauthorized",
      })
    }

    // Merge foodId data into items
    const listObj = shoppingList.toObject()
    listObj.items = listObj.items.map((item) => {
      if (item.foodId && typeof item.foodId === "object") {
        return {
          ...item,
          image: item.foodId.image || item.image,
          category: item.category || item.foodId.category,
        }
      }
      return item
    })

    res.json({ success: true, shoppingList: listObj })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
}

exports.markItemAsBought = async (req, res) => {
  try {
    const { listId, itemId } = req.params

    // Find the shopping list
    const shoppingList = await ShoppingList.findOne({
      _id: listId,
      userId: req.user._id,
    })

    if (!shoppingList) {
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
      return res.status(404).json({
        success: false,
        message: "Item not found in shopping list",
      })
    }

    const item = shoppingList.items[itemIndex]

    // Mark item as bought
    item.bought = true

    // Find or create pantry
    let pantry = await Pantry.findOne({ userId: req.user._id })
    if (!pantry) {
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

    pantry.items.push(pantryItem)

    // Save both documents
    try {
      await Promise.all([shoppingList.save(), pantry.save()])
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

exports.addItemsToShoppingList = async (req, res) => {
  try {
    const { id } = req.params
    const { items } = req.body

    // Find the shopping list
    const shoppingList = await ShoppingList.findOne({
      _id: id,
      userId: req.user._id,
    })

    if (!shoppingList) {
      return res.status(404).json({
        success: false,
        message: "Shopping list not found or unauthorized",
      })
    }

    // Format new items to match schema structure
    const newItems = items.map((item) => {
      // Set quantities based on location
      const parsedQuantity =
        typeof item.quantity === "number"
          ? item.quantity
          : parseFloat(item.quantity) || 1

      const quantities = {
        meal: 0,
        "shopping-list": item.location === "shopping-list" ? parsedQuantity : 0,
        pantry: item.location === "pantry" ? parsedQuantity : 0,
      }

      return {
        _id: item._id,
        foodId: item.foodId || item._id,
        name: item.name,
        estimatedPrice: item.estimatedPrice || item.price || 0,
        quantity: parsedQuantity,
        quantities: quantities,
        unit: item.unit || "kpl",
        category: item.category || item.categories || [],
        calories: item.calories || 0,
        price: item.price || 0,
        bought: false,
      }
    })

    // Add new items to the shopping list
    shoppingList.items.push(...newItems)

    // Recalculate total estimated price
    shoppingList.totalEstimatedPrice = shoppingList.items.reduce(
      (total, item) => total + (item.estimatedPrice || 0),
      0
    )

    // Save the updated shopping list
    try {
      await shoppingList.save()
    } catch (saveError) {
      console.error("Error saving shopping list:", saveError)
      throw saveError
    }

    res.json({
      success: true,
      shoppingList,
    })
  } catch (error) {
    console.error("Error in addItemsToShoppingList:", error)
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
