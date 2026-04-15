import { Router } from "express"
const {
  createMeal,
  getMeals,
  updateMeal,
  deleteMeal,
  uploadMealImage,
  removeMealImage,
} = require("../controllers/meal")
import { isAuth } from "../middlewares/auth"
import { mealUpload } from "../middlewares/uploadImage"

const router = Router()

router.post("/meals", isAuth, createMeal)
router.get("/meals", isAuth, getMeals)
router.put("/meals/:mealId", isAuth, updateMeal)
router.delete("/meals/:mealId", isAuth, deleteMeal)
router.post("/meals/:mealId/image", isAuth, mealUpload, uploadMealImage)
router.delete("/meals/:mealId/image", isAuth, removeMealImage)

export default router
