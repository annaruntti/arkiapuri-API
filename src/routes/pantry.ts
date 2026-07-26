import { Router } from "express"
import { isAuth } from "../middlewares/auth"
import {
  getPantry,
  addFoodItemToPantry,
  updatePantryItem,
  removePantryItem,
} from "../controllers/pantry"

const router = Router()

router.get("/pantry", isAuth, getPantry)
router.post("/pantry/items", isAuth, addFoodItemToPantry)
router.put("/pantry/items/:itemId", isAuth, updatePantryItem)
router.delete("/pantry/items/:itemId", isAuth, removePantryItem)

export default router
