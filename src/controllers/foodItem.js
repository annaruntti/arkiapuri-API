const FoodItem = require("../models/foodItem")
const User = require("../models/user")

exports.createFoodItem = async (req, res) => {
  try {
    const { name, category, quantity, expireDay, price, calories } = req.body

    const foodItem = new FoodItem({
      name,
      category,
      quantity,
      expireDay,
      price,
      calories,
      user: req.user._id,
    })

    await foodItem.save()

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
    const foodItems = await FoodItem.find({ user: req.user._id })
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
        message: "Food item not found or you don't have permission",
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
        message: "Food item not found or you don't have permission",
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
