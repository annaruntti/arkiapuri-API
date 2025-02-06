const express = require("express")
const {
  createMeal,
  getMeals,
  updateMeal,
  deleteMeal,
} = require("../controllers/meal")
const { isAuth } = require("../middlewares/auth")

const router = express.Router()

router.post("/meals", isAuth, createMeal)
router.get("/meals", isAuth, getMeals)
router.put("/meals/:id", isAuth, updateMeal)
router.delete("/meals/:id", isAuth, deleteMeal)

module.exports = router
