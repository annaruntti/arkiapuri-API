const express = require("express")
const { isAuth } = require("../middlewares/auth")
const {
  createShoppingList,
  getShoppingLists,
  updateShoppingList,
  deleteShoppingList,
  markItemAsBought,
  addItemsToShoppingList,
} = require("../controllers/shoppingList")

const router = express.Router()

router.post("/shopping-lists", isAuth, createShoppingList)
router.post("/shopping-lists/:id/items", isAuth, addItemsToShoppingList)
router.get("/shopping-lists", isAuth, getShoppingLists)
router.put("/shopping-lists/:id", isAuth, updateShoppingList)
router.delete("/shopping-lists/:id", isAuth, deleteShoppingList)
router.post(
  "/shopping-lists/:listId/items/:itemId/bought",
  isAuth,
  markItemAsBought
)

module.exports = router
