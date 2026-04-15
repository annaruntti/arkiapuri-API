import { Router } from "express"
import { isAuth } from "../middlewares/auth"
const {
  createShoppingList,
  getShoppingLists,
  updateShoppingList,
  deleteShoppingList,
  markItemAsBought,
  addItemsToShoppingList,
} = require("../controllers/shoppingList")

const router = Router()

router.post("/shopping-lists", isAuth, createShoppingList)
router.post("/shopping-lists/:id/items", isAuth, addItemsToShoppingList)
router.get("/shopping-lists", isAuth, getShoppingLists)
router.put("/shopping-lists/:id", isAuth, updateShoppingList)
router.delete("/shopping-lists/:id", isAuth, deleteShoppingList)
router.post("/shopping-lists/:listId/items/:itemId/bought", isAuth, markItemAsBought)

export default router
