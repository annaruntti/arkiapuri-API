const express = require("express")
const { isAuth } = require("../middlewares/auth")
const {
  getPantry,
  addPantryItem,
  updatePantryItem,
  removePantryItem,
} = require("../controllers/pantry")

const router = express.Router()

router.get("/pantry", isAuth, getPantry)
router.post("/pantry/items", isAuth, addPantryItem)
router.put("/pantry/items/:itemId", isAuth, updatePantryItem)
router.delete("/pantry/items/:itemId", isAuth, removePantryItem)

module.exports = router
