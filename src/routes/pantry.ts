import { Router } from "express"
import { isAuth } from "../middlewares/auth"
const {
  getPantry,
  addFoodItemToPantry,
  updatePantryItem,
  removePantryItem,
  moveToPantry,
} = require("../controllers/pantry")

const router = Router()

router.get("/pantry", isAuth, getPantry)
router.post("/pantry/items", isAuth, addFoodItemToPantry)
router.post("/pantry/move-from-shopping", isAuth, moveToPantry)
router.put("/pantry/items/:itemId", isAuth, updatePantryItem)
router.delete("/pantry/items/:itemId", isAuth, removePantryItem)

export default router
