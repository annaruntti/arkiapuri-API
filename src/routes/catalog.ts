import { Router } from "express"
import { isAuth } from "../middleware/auth"
import { requirePlatformAdmin } from "../middleware/requirePlatformAdmin"
import {
  adminDeleteCatalogFood,
  adminDeleteCatalogMeal,
  adminListFoodItems,
  adminListMeals,
  adminPublishFoodItem,
  adminPublishMeal,
  copyCatalogFoodItem,
  copyCatalogMeal,
  listCatalogFoodItems,
  listCatalogMeals,
} from "../controllers/catalog"

const router = Router()

router.get("/catalog/food-items", isAuth, listCatalogFoodItems)
router.get("/catalog/meals", isAuth, listCatalogMeals)
router.post("/catalog/food-items/:id/copy", isAuth, copyCatalogFoodItem)
router.post("/catalog/meals/:id/copy", isAuth, copyCatalogMeal)

router.get(
  "/admin/food-items",
  isAuth,
  requirePlatformAdmin,
  adminListFoodItems
)
router.post(
  "/admin/catalog/food-items",
  isAuth,
  requirePlatformAdmin,
  adminPublishFoodItem
)
router.get("/admin/meals", isAuth, requirePlatformAdmin, adminListMeals)
router.post(
  "/admin/catalog/meals",
  isAuth,
  requirePlatformAdmin,
  adminPublishMeal
)
router.delete(
  "/admin/catalog/food-items/:id",
  isAuth,
  requirePlatformAdmin,
  adminDeleteCatalogFood
)
router.delete(
  "/admin/catalog/meals/:id",
  isAuth,
  requirePlatformAdmin,
  adminDeleteCatalogMeal
)

export default router
