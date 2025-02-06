const express = require("express")
const {
  createFoodItem,
  getFoodItems,
  getFoodItemById,
  updateFoodItem,
  deleteFoodItem,
} = require("../controllers/foodItem")
const { isAuth } = require("../middlewares/auth")

const router = express.Router()

router.post("/foodItems", isAuth, createFoodItem)
router.get("/foodItems", isAuth, getFoodItems)
router.get("/foodItems/:id", isAuth, getFoodItemById)
router.put("/foodItems/:id", isAuth, updateFoodItem)
router.delete("/foodItems/:id", isAuth, deleteFoodItem)

module.exports = router
