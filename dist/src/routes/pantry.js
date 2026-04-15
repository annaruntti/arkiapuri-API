"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const { getPantry, addFoodItemToPantry, updatePantryItem, removePantryItem, moveToPantry, } = require("../controllers/pantry");
const router = (0, express_1.Router)();
router.get("/pantry", auth_1.isAuth, getPantry);
router.post("/pantry/items", auth_1.isAuth, addFoodItemToPantry);
router.post("/pantry/move-from-shopping", auth_1.isAuth, moveToPantry);
router.put("/pantry/items/:itemId", auth_1.isAuth, updatePantryItem);
router.delete("/pantry/items/:itemId", auth_1.isAuth, removePantryItem);
exports.default = router;
//# sourceMappingURL=pantry.js.map