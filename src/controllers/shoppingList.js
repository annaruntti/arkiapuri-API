const ShoppingList = require("../models/shoppingList")
const Pantry = require("../models/pantry")
const FoodItem = require("../models/foodItem")

exports.createShoppingList = async (req, res) => {
  try {
    const { name, description, items, totalEstimatedPrice } = req.body

    // Log incoming items to debug
    console.log("Incoming items:", items)

    const shoppingList = new ShoppingList({
      userId: req.user._id,
      name,
      description,
      items: items.map((item) => {
        // Log each item's data before mapping
        console.log("Item data before mapping:", {
          name: item.name,
          quantity: item.quantity,
          quantities: item.quantities,
          location: item.location,
          quantityType: typeof item.quantity,
        })

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

    // Log the shopping list before saving
    console.log("Shopping list before save:", {
      items: shoppingList.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        quantities: item.quantities,
        location: item.location,
        quantityType: typeof item.quantity,
      })),
    })

    await shoppingList.save()

    // Log the saved shopping list
    const savedList = await ShoppingList.findById(shoppingList._id)
    console.log("Saved shopping list:", {
      items: savedList.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        quantities: item.quantities,
        location: item.location,
        quantityType: typeof item.quantity,
      })),
    })

    res.json({ success: true, shoppingList })
  } catch (error) {
    console.error("Error creating shopping list:", error)
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

exports.addItemsToShoppingList = async (req, res) => {
  try {
    const { id } = req.params
    const { items } = req.body
    console.log("Adding items to shopping list:", { id, items })

    // Find the shopping list
    const shoppingList = await ShoppingList.findOne({
      _id: id,
      userId: req.user._id,
    })

    if (!shoppingList) {
      console.log("Shopping list not found:", id)
      return res.status(404).json({
        success: false,
        message: "Shopping list not found or unauthorized",
      })
    }

    // Format new items to match schema structure
    const newItems = items.map((item) => {
      // Log the incoming item data
      console.log("Processing item:", {
        name: item.name,
        quantity: item.quantity,
        quantities: item.quantities,
        location: item.location,
        quantityType: typeof item.quantity,
      })

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

    // Log the processed items
    console.log(
      "Processed items:",
      newItems.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        quantities: item.quantities,
        location: item.location,
        quantityType: typeof item.quantity,
      }))
    )

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
      console.log("Successfully added items to shopping list")

      // Log the saved shopping list
      const savedList = await ShoppingList.findById(id)
      console.log(
        "Saved shopping list items:",
        savedList.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          quantities: item.quantities,
          location: item.location,
          quantityType: typeof item.quantity,
        }))
      )
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
