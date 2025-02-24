const express = require("express")
const { isAuth } = require("../middlewares/auth")
const {
  getFoodItems,
  createFoodItem,
  updateFoodItem,
  deleteFoodItem,
  updateQuantity,
  moveItem,
} = require("../controllers/foodItem")

const router = express.Router()

// Get all food items
router.get("/food-items", isAuth, getFoodItems)

// Create new food item
router.post("/food-items", isAuth, createFoodItem)

// Update food item
router.put("/food-items/:id", isAuth, updateFoodItem)

// Delete food item
router.delete("/food-items/:id", isAuth, deleteFoodItem)

// Update quantity in a specific location
router.put("/food-items/:foodItemId/quantity", isAuth, updateQuantity)

// Move item between locations
router.post("/food-items/:foodItemId/move", isAuth, moveItem)

module.exports = router
