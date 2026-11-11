import { Response } from "express"
import {
  AuthenticatedRequest,
  getErrorMessage,
} from "../helpers/controllerUtils"
import {
  copyGlobalFoodItemToUser,
  copyGlobalMealToUser,
  deleteGlobalFoodItem,
  deleteGlobalMeal,
  listAdminMeals,
  listGlobalFoodItems,
  listGlobalMeals,
  listPrivateFoodItemsForAdmin,
  publishFoodItemToCatalog,
  publishMealToCatalog,
} from "../services/globalCatalog"

const statusCode = (status: string) => {
  if (status === "not_found") return 404
  if (status === "forbidden") return 403
  if (status === "conflict") return 409
  return 400
}

export const adminListFoodItems = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : undefined
    const foodItems = await listPrivateFoodItemsForAdmin(q)
    res.json({ success: true, foodItems })
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const adminPublishFoodItem = async (
  req: AuthenticatedRequest<Record<string, string>, unknown, { foodItemId?: string }>,
  res: Response
) => {
  try {
    const result = await publishFoodItemToCatalog(
      req.user,
      String(req.body?.foodItemId || "")
    )
    if (result.status !== "ok") {
      return res
        .status(statusCode(result.status))
        .json({ success: false, message: result.message })
    }
    res.json({ success: true, foodItem: result.data })
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const adminListMeals = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : undefined
    const meals = await listAdminMeals(req.user, q)
    res.json({ success: true, meals })
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const adminPublishMeal = async (
  req: AuthenticatedRequest<Record<string, string>, unknown, { mealId?: string }>,
  res: Response
) => {
  try {
    const result = await publishMealToCatalog(
      req.user,
      String(req.body?.mealId || "")
    )
    if (result.status !== "ok") {
      return res
        .status(statusCode(result.status))
        .json({ success: false, message: result.message })
    }
    res.json({ success: true, meal: result.data })
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const adminDeleteCatalogFood = async (
  req: AuthenticatedRequest<{ id: string }>,
  res: Response
) => {
  try {
    const result = await deleteGlobalFoodItem(req.params.id)
    if (result.status !== "ok") {
      return res
        .status(statusCode(result.status))
        .json({ success: false, message: result.message })
    }
    res.json({ success: true })
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const adminDeleteCatalogMeal = async (
  req: AuthenticatedRequest<{ id: string }>,
  res: Response
) => {
  try {
    const result = await deleteGlobalMeal(req.params.id)
    if (result.status !== "ok") {
      return res
        .status(statusCode(result.status))
        .json({ success: false, message: result.message })
    }
    res.json({ success: true })
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const listCatalogFoodItems = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : undefined
    const foodItems = await listGlobalFoodItems(q)
    res.json({ success: true, foodItems })
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const listCatalogMeals = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : undefined
    const meals = await listGlobalMeals(q)
    res.json({ success: true, meals })
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const copyCatalogFoodItem = async (
  req: AuthenticatedRequest<{ id: string }>,
  res: Response
) => {
  try {
    const result = await copyGlobalFoodItemToUser(req.user, req.params.id)
    if (result.status !== "ok") {
      return res
        .status(statusCode(result.status))
        .json({ success: false, message: result.message })
    }
    res.json({ success: true, foodItem: result.data })
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const copyCatalogMeal = async (
  req: AuthenticatedRequest<{ id: string }>,
  res: Response
) => {
  try {
    const result = await copyGlobalMealToUser(req.user, req.params.id)
    if (result.status !== "ok") {
      return res
        .status(statusCode(result.status))
        .json({ success: false, message: result.message })
    }
    res.json({ success: true, meal: result.data })
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}
