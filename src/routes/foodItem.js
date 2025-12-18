const express = require("express")
const { isAuth } = require("../middlewares/auth")
const { foodItemUpload } = require("../middlewares/uploadImage")
const {
  getFoodItems,
  createFoodItem,
  updateFoodItem,
  deleteFoodItem,
  updateQuantity,
  moveItem,
  uploadFoodItemImage,
  removeFoodItemImage,
  findOrCreateFoodItem,
  checkItemAvailability,
} = require("../controllers/foodItem")

const router = express.Router()

// Get all food items
router.get("/food-items", isAuth, getFoodItems)

// Check if food item exists in pantry or shopping list
router.post("/food-items/check-availability", isAuth, checkItemAvailability)

// Find or create food item (with name matching)
router.post("/food-items/find-or-create", isAuth, findOrCreateFoodItem)

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

// Upload food item image
router.post(
  "/food-items/:foodItemId/image",
  isAuth,
  foodItemUpload,
  uploadFoodItemImage
)

// Remove food item image
router.delete("/food-items/:foodItemId/image", isAuth, removeFoodItemImage)

module.exports = router
