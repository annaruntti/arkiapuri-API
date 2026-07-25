import { Request, Response } from "express"
import type { Model } from "mongoose"
import type { IFoodItem } from "../models/foodItem"
import type { IUser } from "../models/user"
import openFoodFactsService from "../services/openFoodFactsService"

interface ModelModule<T> {
  default?: T
}

type ResolvableModule<T> = ModelModule<T> | T | null | undefined

const resolveModule = <T>(module: ResolvableModule<T>): T =>
  (module as ModelModule<T>)?.default || (module as T)

const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))

type AuthenticatedRequest<
  P = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>
> = Request<P, ResBody, ReqBody, ReqQuery> & { user: IUser }

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error"

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
exports.searchByBarcode = async (
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
exports.searchByText = async (
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
exports.searchByCategory = async (
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
exports.getCategories = async (_req: Request, res: Response) => {
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
exports.getSuggestions = async (
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
exports.addToFoodItems = async (
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

    if (existingFoodItem) {
      existingFoodItem.quantities[location as keyof typeof existingFoodItem.quantities] +=
        parseFloat(String(quantity))
      await existingFoodItem.save()

      return res.json({
        success: true,
        message: "Product quantity updated",
        foodItem: existingFoodItem,
        fromOpenFoodFacts: true,
      })
    }

    const foodItemData = {
      name: offProduct.name,
      category: [offProduct.mainCategory],
      unit: unit,
      calories: offProduct.nutrition.calories,
      user: req.user._id,
      quantities: {
        meal: location === "meal" ? parseFloat(String(quantity)) : 0,
        "shopping-list":
          location === "shopping-list" ? parseFloat(String(quantity)) : 0,
        pantry: location === "pantry" ? parseFloat(String(quantity)) : 0,
      },
      openFoodFactsData: {
        barcode: offProduct.barcode,
        brands: offProduct.brands,
        nutritionGrade: ["a", "b", "c", "d", "e"].includes(
          offProduct.nutritionGrade?.toLowerCase() ?? ""
        )
          ? offProduct.nutritionGrade!.toLowerCase()
          : undefined,
        novaGroup: [1, 2, 3, 4].includes(offProduct.novaGroup ?? -1)
          ? offProduct.novaGroup
          : undefined,
        imageUrl: offProduct.imageUrl,
        nutrition: offProduct.nutrition,
        labels: offProduct.labels,
        allergens: offProduct.allergens,
        lastUpdated: new Date(),
      },
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
        quantity: parseFloat(String(quantity)),
        unit,
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
exports.enrichFoodItem = async (
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

    foodItem.calories = offProduct.nutrition.calories || foodItem.calories
    foodItem.category = [
      ...new Set([...foodItem.category, offProduct.mainCategory]),
    ]
    foodItem.openFoodFactsData = {
      barcode: offProduct.barcode,
      brands: offProduct.brands,
      nutritionGrade: ["a", "b", "c", "d", "e"].includes(
        offProduct.nutritionGrade?.toLowerCase() ?? ""
      )
        ? (offProduct.nutritionGrade!.toLowerCase() as
            | "a"
            | "b"
            | "c"
            | "d"
            | "e")
        : undefined,
      novaGroup: [1, 2, 3, 4].includes(offProduct.novaGroup ?? -1)
        ? (offProduct.novaGroup as 1 | 2 | 3 | 4)
        : undefined,
      imageUrl: offProduct.imageUrl ?? undefined,
      nutrition: offProduct.nutrition,
      labels: offProduct.labels,
      allergens: offProduct.allergens,
      lastUpdated: new Date(),
    }

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
