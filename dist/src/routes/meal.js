"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const { createMeal, getMeals, updateMeal, deleteMeal, uploadMealImage, removeMealImage, } = require("../controllers/meal");
const auth_1 = require("../middlewares/auth");
const uploadImage_1 = require("../middlewares/uploadImage");
const router = (0, express_1.Router)();
router.post("/meals", auth_1.isAuth, createMeal);
router.get("/meals", auth_1.isAuth, getMeals);
router.put("/meals/:mealId", auth_1.isAuth, updateMeal);
router.delete("/meals/:mealId", auth_1.isAuth, deleteMeal);
router.post("/meals/:mealId/image", auth_1.isAuth, uploadImage_1.mealUpload, uploadMealImage);
router.delete("/meals/:mealId/image", auth_1.isAuth, removeMealImage);
exports.default = router;
//# sourceMappingURL=meal.js.map