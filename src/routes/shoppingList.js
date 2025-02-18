const express = require("express")
const { isAuth } = require("../middlewares/auth")
const {
  createShoppingList,
  getShoppingLists,
  updateShoppingList,
  deleteShoppingList,
} = require("../controllers/shoppingList")

const router = express.Router()

router.post("/shopping-lists", isAuth, createShoppingList)
router.get("/shopping-lists", isAuth, getShoppingLists)
router.put("/shopping-lists/:id", isAuth, updateShoppingList)
router.delete("/shopping-lists/:id", isAuth, deleteShoppingList)

module.exports = router
