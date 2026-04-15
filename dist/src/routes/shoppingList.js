"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const { createShoppingList, getShoppingLists, updateShoppingList, deleteShoppingList, markItemAsBought, addItemsToShoppingList, } = require("../controllers/shoppingList");
const router = (0, express_1.Router)();
router.post("/shopping-lists", auth_1.isAuth, createShoppingList);
router.post("/shopping-lists/:id/items", auth_1.isAuth, addItemsToShoppingList);
router.get("/shopping-lists", auth_1.isAuth, getShoppingLists);
router.put("/shopping-lists/:id", auth_1.isAuth, updateShoppingList);
router.delete("/shopping-lists/:id", auth_1.isAuth, deleteShoppingList);
router.post("/shopping-lists/:listId/items/:itemId/bought", auth_1.isAuth, markItemAsBought);
exports.default = router;
//# sourceMappingURL=shoppingList.js.map