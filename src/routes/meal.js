const express = require("express")
const {
  createMeal,
  getMeals,
  updateMeal,
  deleteMeal,
  uploadMealImage,
  removeMealImage,
} = require("../controllers/meal")
const { isAuth } = require("../middlewares/auth")
const { mealUpload } = require("../middlewares/uploadImage")

const router = express.Router()

router.post("/meals", isAuth, createMeal)
router.get("/meals", isAuth, getMeals)
router.put("/meals/:mealId", isAuth, updateMeal)
router.delete("/meals/:mealId", isAuth, deleteMeal)
router.post("/meals/:mealId/image", isAuth, mealUpload, uploadMealImage)
router.delete("/meals/:mealId/image", isAuth, removeMealImage)

module.exports = router
