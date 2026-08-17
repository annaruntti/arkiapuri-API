import { Request, Response } from "express"
import type { Model } from "mongoose"
import type { IFoodItem } from "../models/foodItem"
import {
  AuthenticatedRequest,
  getErrorMessage,
  resolveModule,
} from "../helpers/controllerUtils"
import openFoodFactsService from "../services/openFoodFactsService"
import {
  applyMappedOpenFoodFactsToFoodItem,
  mapOpenFoodFactsToFoodItemFields,
  normalizeAppUnit,
} from "../utils/openFoodFactsMapper"

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
    const pageSize = Math.min(asNumber(limit, 20), 50)

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
    const { barcode } = req.params
    const {
      location = "shopping-list",
      quantity = 1,
      unit = "pcs",
      shoppingListId = null,
      mealId = null,
    } = req.body

    if (!barcode) {
      return res.status(400).json({
        success: false,
        message: "Barcode is required",
      })
    }

    if (!["meal", "shopping-list", "pantry"].includes(location)) {
      return res.status(400).json({
        success: false,
        message: "Invalid location",
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

    const existingFoodItem = await FoodItem.findOne({
      user: req.user._id,
      name: offProduct.name,
    })

    const mapped = mapOpenFoodFactsToFoodItemFields(offProduct)
    // Client search hits often lack product_quantity and misparse labels like
    // "4 kpl, 350 g" as 4 kpl. This endpoint re-fetches by barcode, so its
    // mapped package size is authoritative whenever the client only sent a
    // default piece unit (kpl/pcs) while OFF has a real mass/volume package.
    const clientSentDefaultUnit = !unit || unit === "pcs" || unit === "kpl"
    const requestedQuantity = parseFloat(String(quantity))
    const hasValidRequestedQuantity =
      Number.isFinite(requestedQuantity) && requestedQuantity > 0
    const preferOffPackage =
      clientSentDefaultUnit &&
      (mapped.unit !== "kpl" ||
        !hasValidRequestedQuantity ||
        requestedQuantity === 1)
    const normalizedUnit = preferOffPackage
      ? mapped.unit
      : normalizeAppUnit(unit)
    const parsedQuantity = preferOffPackage
      ? mapped.packageQuantity
      : hasValidRequestedQuantity
        ? requestedQuantity
        : mapped.packageQuantity || 1

    if (existingFoodItem) {
      applyMappedOpenFoodFactsToFoodItem(existingFoodItem, mapped, "merge")

      await existingFoodItem.save()

      return res.json({
        success: true,
        message: "Product quantity updated",
        foodItem: existingFoodItem,
        fromOpenFoodFacts: true,
        collectionData: {
          location,
          quantity: parsedQuantity,
          unit: normalizedUnit,
          shoppingListId,
          mealId,
        },
      })
    }

    const foodItemData = {
      name: mapped.name,
      category: mapped.category,
      unit: normalizedUnit,
      packageQuantity: mapped.packageQuantity,
      calories: mapped.calories,
      user: req.user._id,
      image: mapped.image,
      quantities: {
        meal: 0,
        "shopping-list": 0,
        pantry: 0,
      },
      openFoodFactsData: mapped.openFoodFactsData,
    }

    const foodItem = new FoodItem(foodItemData)
    await foodItem.save()

    res.json({
      success: true,
      message: "Product added from Open Food Facts",
      foodItem,
      fromOpenFoodFacts: true,
      openFoodFactsData: offProduct,
      collectionData: {
        location,
        quantity: parsedQuantity,
        unit: normalizedUnit,
        shoppingListId,
        mealId,
      },
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
