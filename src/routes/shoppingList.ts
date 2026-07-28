import { Router } from "express"
import { isAuth } from "../middlewares/auth"
import {
  createShoppingList,
  getShoppingLists,
  updateShoppingList,
  deleteShoppingList,
  markItemAsBought,
  moveItemToPantry,
  moveItemsToPantry,
  setItemBought,
  deleteShoppingListItem,
  addItemsToShoppingList,
  updateShoppingListItem,
} from "../controllers/shoppingList"

const router = Router()

router.post("/shopping-lists", isAuth, createShoppingList)
router.post("/shopping-lists/:id/items", isAuth, addItemsToShoppingList)
router.get("/shopping-lists", isAuth, getShoppingLists)
router.put("/shopping-lists/:id", isAuth, updateShoppingList)
router.delete("/shopping-lists/:id", isAuth, deleteShoppingList)
router.put(
  "/shopping-lists/:listId/items/:itemId",
  isAuth,
  updateShoppingListItem
)
router.patch(
  "/shopping-lists/:listId/items/:itemId/bought",
  isAuth,
  setItemBought
)
router.post(
  "/shopping-lists/:listId/items/move-to-pantry",
  isAuth,
  moveItemsToPantry
)
router.post(
  "/shopping-lists/:listId/items/:itemId/move-to-pantry",
  isAuth,
  moveItemToPantry
)
router.delete(
  "/shopping-lists/:listId/items/:itemId",
  isAuth,
  deleteShoppingListItem
)
/** Legacy: same as move-to-pantry */
router.post(
  "/shopping-lists/:listId/items/:itemId/bought",
  isAuth,
  markItemAsBought
)

export default router
