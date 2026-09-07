import { Router } from "express"
import { isAuth } from "../middleware/auth"
import {
  getPantry,
  addFoodItemToPantry,
  updatePantryItem,
  removePantryItem,
  addPantryLocation,
  updatePantryLocation,
  removePantryLocation,
  dismissPantryRemovalSuggestions,
} from "../controllers/pantry"

const router = Router()

router.get("/pantry", isAuth, getPantry)
router.post("/pantry/items", isAuth, addFoodItemToPantry)
router.put("/pantry/items/:itemId", isAuth, updatePantryItem)
router.delete("/pantry/items/:itemId", isAuth, removePantryItem)
router.post("/pantry/locations", isAuth, addPantryLocation)
router.put("/pantry/locations/:locationId", isAuth, updatePantryLocation)
router.delete("/pantry/locations/:locationId", isAuth, removePantryLocation)
router.post(
  "/pantry/removal-suggestions/dismiss",
  isAuth,
  dismissPantryRemovalSuggestions
)

export default router
