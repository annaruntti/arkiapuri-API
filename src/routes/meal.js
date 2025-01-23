const express = require("express")
const { createMeal, getMeals } = require("../controllers/meal")

const router = express.Router()

router.post("/meals", createMeal)
router.get("/meals", getMeals)

module.exports = router
