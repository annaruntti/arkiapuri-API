import { Request, Response } from "express"
import type { Model } from "mongoose"
import type { IFoodItem } from "../models/foodItem"
import {
  AuthenticatedRequest,
  getErrorMessage,
  resolveModule,
} from "../helpers/controllerUtils"
import openFoodFactsService from "../services/openFoodFactsService"
import { addOpenFoodFactsToFoodItems } from "../services/openFoodFactsAdd"
import {
  applyMappedOpenFoodFactsToFoodItem,
  mapOpenFoodFactsToFoodItemFields,
} from "../utils/openFoodFactsMapper"
import { fillFoodItemPriceFromOpenPrices } from "../services/openPrices"

const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))

const asString = (value: unknown): string => {
  if (typeof value === "string") return value
  if (Array.isArray(value) && typeof value[0] === "string") return value[0]
  return ""
}

const asNumber = (value: unknown, fallback: number): number => {
  const parsed = parseInt(asString(value) || String(value), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Search products by barcode
 */
export const searchByBarcode = async (
  req: Request<{ barcode: string }>,
  res: Response
) => {
  try {
    const { barcode } = req.params

    if (!barcode) {
      return res.status(400).json({
        success: false,
        message: "Barcode is required",
      })
    }

    if (!openFoodFactsService.isValidBarcode(barcode)) {
      return res.status(400).json({
        success: false,
        message: "Invalid barcode format",
      })
    }

    const cleanBarcode = openFoodFactsService.cleanBarcode(barcode)
    const product = await openFoodFactsService.searchByBarcode(cleanBarcode)

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
        barcode: cleanBarcode,
      })
    }

    res.json({
      success: true,
      product,
    })
  } catch (error: unknown) {
    console.error("Error in searchByBarcode:", error)
    res.status(500).json({
      success: false,
      message: "Failed to search product by barcode",
      error: getErrorMessage(error),
    })
  }
}

/**
 * Search products by text query
 */
export const searchByText = async (
  req: Request<
    Record<string, string>,
    unknown,
    unknown,
    { q?: string; page?: string; limit?: string }
  >,
  res: Response
) => {
  try {
    const query = asString(req.query.q)
    const page = req.query.page
    const limit = req.query.limit

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 2 characters long",
      })
    }

    const pageNum = asNumber(page, 1)
    const pageSize = Math.min(asNumber(limit, 50), 50)

    const results = await openFoodFactsService.searchByText(
      query.trim(),
      pageNum,
      pageSize
    )

    res.json({
      success: true,
      query: query.trim(),
      ...results,
    })
  } catch (error: unknown) {
    console.error("Error in searchByText:", error)
    res.status(500).json({
      success: false,
      message: "Failed to search products by text",
      error: getErrorMessage(error),
    })
  }
}

/**
 * Search products by category
 */
export const searchByCategory = async (
  req: Request<
    { category: string },
    unknown,
    unknown,
    { page?: string; limit?: string }
  >,
  res: Response
) => {
  try {
    const { category } = req.params
    const { page, limit } = req.query

    if (!category) {
      return res.status(400).json({
        success: false,
        message: "Category is required",
      })
    }

    const pageNum = asNumber(page, 1)
    const pageSize = Math.min(asNumber(limit, 20), 50)

    const results = await openFoodFactsService.searchByCategory(
      category,
      pageNum,
      pageSize
    )

    res.json({
      success: true,
      category,
      ...results,
    })
  } catch (error: unknown) {
    console.error("Error in searchByCategory:", error)
    res.status(500).json({
      success: false,
      message: "Failed to search products by category",
      error: getErrorMessage(error),
    })
  }
}

/**
 * Get popular categories
 */
export const getCategories = async (_req: Request, res: Response) => {
  try {
    const categories = await openFoodFactsService.getPopularCategories()

    res.json({
      success: true,
      categories,
    })
  } catch (error: unknown) {
    console.error("Error in getCategories:", error)
    res.status(500).json({
      success: false,
      message: "Failed to get categories",
      error: getErrorMessage(error),
    })
  }
}

/**
 * Get product suggestions for autocomplete
 */
export const getSuggestions = async (
  req: Request<
    Record<string, string>,
    unknown,
    unknown,
    { q?: string; limit?: string }
  >,
  res: Response
) => {
  try {
    const query = asString(req.query.q)
    const limit = req.query.limit

    if (!query || query.trim().length < 2) {
      return res.json({
        success: true,
        suggestions: [],
      })
    }

    const suggestions = await openFoodFactsService.getProductSuggestions(
      query.trim(),
      Math.min(asNumber(limit, 10), 20)
    )

    res.json({
      success: true,
      query: query.trim(),
      suggestions,
    })
  } catch (error: unknown) {
    console.error("Error in getSuggestions:", error)
    res.status(500).json({
      success: false,
      message: "Failed to get product suggestions",
      error: getErrorMessage(error),
    })
  }
}

/**
 * Add Open Food Facts product to user's food items
 */
export const addToFoodItems = async (
  req: AuthenticatedRequest<
    { barcode: string },
    unknown,
    {
      location?: string
      quantity?: number | string
      unit?: string
      shoppingListId?: string | null
      mealId?: string | null
    }
  >,
  res: Response
) => {
  try {
    const result = await addOpenFoodFactsToFoodItems(req.user, {
      barcode: req.params.barcode,
      location: req.body.location,
      quantity: req.body.quantity,
      unit: req.body.unit,
      shoppingListId: req.body.shoppingListId,
      mealId: req.body.mealId,
    })

    if (result.status !== "ok") {
      const statusCode = result.status === "not_found" ? 404 : 400
      return res.status(statusCode).json({
        success: false,
        message: result.message,
      })
    }

    res.json({
      success: true,
      message: result.message,
      foodItem: result.foodItem,
      fromOpenFoodFacts: result.fromOpenFoodFacts,
      ...(result.openFoodFactsData
        ? { openFoodFactsData: result.openFoodFactsData }
        : {}),
      collectionData: result.collectionData,
    })
  } catch (error: unknown) {
    console.error("Error in addToFoodItems:", error)
    res.status(500).json({
      success: false,
      message: "Failed to add product to food items",
      error: getErrorMessage(error),
    })
  }
}

/**
 * Enrich existing food item with Open Food Facts data
 */
export const enrichFoodItem = async (
  req: AuthenticatedRequest<
    { foodItemId: string },
    unknown,
    { barcode?: string }
  >,
  res: Response
) => {
  try {
    const { foodItemId } = req.params
    const { barcode } = req.body

    if (!barcode) {
      return res.status(400).json({
        success: false,
        message: "Barcode is required",
      })
    }

    const foodItem = await FoodItem.findOne({
      _id: foodItemId,
      user: req.user._id,
    })

    if (!foodItem) {
      return res.status(404).json({
        success: false,
        message: "Food item not found",
      })
    }

    const cleanBarcode = openFoodFactsService.cleanBarcode(barcode)
    const offProduct = await openFoodFactsService.searchByBarcode(cleanBarcode)

    if (!offProduct) {
      return res.status(404).json({
        success: false,
        message: "Product not found in Open Food Facts database",
      })
    }

    const mapped = mapOpenFoodFactsToFoodItemFields(offProduct)

    applyMappedOpenFoodFactsToFoodItem(foodItem, mapped, "replace")
    await fillFoodItemPriceFromOpenPrices(foodItem)

    await foodItem.save()

    res.json({
      success: true,
      message: "Food item enriched with Open Food Facts data",
      foodItem,
      openFoodFactsData: offProduct,
    })
  } catch (error: unknown) {
    console.error("Error in enrichFoodItem:", error)
    res.status(500).json({
      success: false,
      message: "Failed to enrich food item",
      error: getErrorMessage(error),
    })
  }
}
