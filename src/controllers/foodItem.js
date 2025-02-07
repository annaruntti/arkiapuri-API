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
      unit,
    })

    await foodItem.save()

    // Add reference to user's foodItems
    await User.findByIdAndUpdate(req.user._id, {
      $push: { foodItems: foodItem._id },
    })

    res.json({ success: true, foodItem })
  } catch (error) {
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
