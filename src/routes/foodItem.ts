import { Router } from "express"
import { isAuth } from "../middlewares/auth"
import { foodItemUpload } from "../middlewares/uploadImage"
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

const router = Router()

router.get("/food-items", isAuth, getFoodItems)
router.post("/food-items/check-availability", isAuth, checkItemAvailability)
router.post("/food-items/find-or-create", isAuth, findOrCreateFoodItem)
router.post("/food-items", isAuth, createFoodItem)
router.put("/food-items/:id", isAuth, updateFoodItem)
router.delete("/food-items/:id", isAuth, deleteFoodItem)
router.put("/food-items/:foodItemId/quantity", isAuth, updateQuantity)
router.post("/food-items/:foodItemId/move", isAuth, moveItem)
router.post("/food-items/:foodItemId/image", isAuth, foodItemUpload, uploadFoodItemImage)
router.delete("/food-items/:foodItemId/image", isAuth, removeFoodItemImage)

export default router
