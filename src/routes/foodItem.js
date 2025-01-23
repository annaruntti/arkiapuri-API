const express = require("express")
const { createFoodItem, getFoodItems } = require("../controllers/foodItem")

const router = express.Router()

router.post("/food-items", createFoodItem)
router.get("/food-items", getFoodItems)

module.exports = router
