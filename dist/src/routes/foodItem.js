"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const uploadImage_1 = require("../middlewares/uploadImage");
const { getFoodItems, createFoodItem, updateFoodItem, deleteFoodItem, updateQuantity, moveItem, uploadFoodItemImage, removeFoodItemImage, findOrCreateFoodItem, checkItemAvailability, } = require("../controllers/foodItem");
const router = (0, express_1.Router)();
router.get("/food-items", auth_1.isAuth, getFoodItems);
router.post("/food-items/check-availability", auth_1.isAuth, checkItemAvailability);
router.post("/food-items/find-or-create", auth_1.isAuth, findOrCreateFoodItem);
router.post("/food-items", auth_1.isAuth, createFoodItem);
router.put("/food-items/:id", auth_1.isAuth, updateFoodItem);
router.delete("/food-items/:id", auth_1.isAuth, deleteFoodItem);
router.put("/food-items/:foodItemId/quantity", auth_1.isAuth, updateQuantity);
router.post("/food-items/:foodItemId/move", auth_1.isAuth, moveItem);
router.post("/food-items/:foodItemId/image", auth_1.isAuth, uploadImage_1.foodItemUpload, uploadFoodItemImage);
router.delete("/food-items/:foodItemId/image", auth_1.isAuth, removeFoodItemImage);
exports.default = router;
//# sourceMappingURL=foodItem.js.map