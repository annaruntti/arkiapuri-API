const express = require("express")
const {
  createFoodItem,
  getFoodItems,
  getFoodItemById,
  updateFoodItem,
  deleteFoodItem,
  moveFoodItem,
} = require("../controllers/foodItem")
const { isAuth } = require("../middlewares/auth")

const router = express.Router()

router.post("/foodItems", isAuth, createFoodItem)
router.get("/foodItems", isAuth, getFoodItems)
router.get("/foodItems/:id", isAuth, getFoodItemById)
router.put("/foodItems/:id", isAuth, updateFoodItem)
router.delete("/foodItems/:id", isAuth, deleteFoodItem)
router.put("/foodItems/:id/move", isAuth, moveFoodItem)

module.exports = router
