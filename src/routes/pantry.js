const express = require("express")
const { isAuth } = require("../middlewares/auth")
const {
  getPantry,
  addFoodItemToPantry,
  updatePantryItem,
  removePantryItem,
  moveToPantry,
} = require("../controllers/pantry")

const router = express.Router()

// Get pantry contents
router.get("/pantry", isAuth, getPantry)

// Add new food item to pantry
router.post("/pantry/items", isAuth, addFoodItemToPantry)

// Move items from shopping list to pantry when marked as bought
router.post("/pantry/move-from-shopping", isAuth, moveToPantry)

// Update pantry item
router.put("/pantry/items/:itemId", isAuth, updatePantryItem)

// Remove item from pantry
router.delete("/pantry/items/:itemId", isAuth, removePantryItem)

module.exports = router
