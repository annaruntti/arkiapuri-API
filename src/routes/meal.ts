import { Router } from "express"
import { isAuth } from "../middleware/auth"
import { mealUpload, requireImageMagicBytes } from "../middleware/uploadImage"
import {
  createMeal,
  getMeals,
  updateMeal,
  deleteMeal,
  uploadMealImage,
  removeMealImage,
} from "../controllers/meal"

const router = Router()

router.post("/meals", isAuth, createMeal)
router.get("/meals", isAuth, getMeals)
router.put("/meals/:mealId", isAuth, updateMeal)
router.delete("/meals/:mealId", isAuth, deleteMeal)
router.post(
  "/meals/:mealId/image",
  isAuth,
  mealUpload,
  requireImageMagicBytes,
  uploadMealImage
)
router.delete("/meals/:mealId/image", isAuth, removeMealImage)

export default router
