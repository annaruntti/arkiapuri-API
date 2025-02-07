const express = require("express")
const { isAuth } = require("../middlewares/auth")
const {
  createShoppingList,
  getShoppingLists,
  updateShoppingList,
  markItemAsBought,
  deleteShoppingList,
} = require("../controllers/shoppingList")

const router = express.Router()

router.post("/shopping-lists", isAuth, createShoppingList)
router.get("/shopping-lists", isAuth, getShoppingLists)
router.put("/shopping-lists/:id", isAuth, updateShoppingList)
router.put(
  "/shopping-lists/:listId/items/:itemId/buy",
  isAuth,
  markItemAsBought
)
router.delete("/shopping-lists/:id", isAuth, deleteShoppingList)

module.exports = router
