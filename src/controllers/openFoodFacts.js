const openFoodFactsService = require("../services/openFoodFactsService")
const FoodItem = require("../models/foodItem")

/**
 * Search products by barcode
 */
exports.searchByBarcode = async (req, res) => {
  try {
    const { barcode } = req.params

    if (!barcode) {
      return res.status(400).json({
        success: false,
        message: "Barcode is required",
      })
    }

    // Validate barcode format
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
  } catch (error) {
    console.error("Error in searchByBarcode:", error)
    res.status(500).json({
      success: false,
      message: "Failed to search product by barcode",
      error: error.message,
    })
  }
}

/**
 * Search products by text query
 */
exports.searchByText = async (req, res) => {
  try {
    const { q: query, page = 1, limit = 20 } = req.query

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 2 characters long",
      })
    }

    const pageNum = parseInt(page) || 1
    const pageSize = Math.min(parseInt(limit) || 20, 50) // Max 50 per page

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
  } catch (error) {
    console.error("Error in searchByText:", error)
    res.status(500).json({
      success: false,
      message: "Failed to search products by text",
      error: error.message,
    })
  }
}

/**
 * Search products by category
 */
exports.searchByCategory = async (req, res) => {
  try {
    const { category } = req.params
    const { page = 1, limit = 20 } = req.query

    if (!category) {
      return res.status(400).json({
        success: false,
        message: "Category is required",
      })
    }

    const pageNum = parseInt(page) || 1
    const pageSize = Math.min(parseInt(limit) || 20, 50)

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
  } catch (error) {
    console.error("Error in searchByCategory:", error)
    res.status(500).json({
      success: false,
      message: "Failed to search products by category",
      error: error.message,
    })
  }
}

/**
 * Get popular categories
 */
exports.getCategories = async (req, res) => {
  try {
    const categories = await openFoodFactsService.getPopularCategories()

    res.json({
      success: true,
      categories,
    })
  } catch (error) {
    console.error("Error in getCategories:", error)
    res.status(500).json({
      success: false,
      message: "Failed to get categories",
      error: error.message,
    })
  }
}

/**
 * Get product suggestions for autocomplete
 */
exports.getSuggestions = async (req, res) => {
  try {
    const { q: query, limit = 10 } = req.query

    if (!query || query.trim().length < 2) {
      return res.json({
        success: true,
        suggestions: [],
      })
    }

    const suggestions = await openFoodFactsService.getProductSuggestions(
      query.trim(),
      Math.min(parseInt(limit) || 10, 20)
    )

    res.json({
      success: true,
      query: query.trim(),
      suggestions,
    })
  } catch (error) {
    console.error("Error in getSuggestions:", error)
    res.status(500).json({
      success: false,
      message: "Failed to get product suggestions",
      error: error.message,
    })
  }
}

/**
 * Add Open Food Facts product to user's food items
 */
exports.addToFoodItems = async (req, res) => {
  try {
    const { barcode } = req.params
    const { location = "shopping-list", quantity = 1, unit = "pcs" } = req.body

    if (!barcode) {
      return res.status(400).json({
        success: false,
        message: "Barcode is required",
      })
    }

    // Validate location
    if (!["meal", "shopping-list", "pantry"].includes(location)) {
      return res.status(400).json({
        success: false,
        message: "Invalid location",
      })
    }

    // First, get the product from Open Food Facts
    const cleanBarcode = openFoodFactsService.cleanBarcode(barcode)
    const offProduct = await openFoodFactsService.searchByBarcode(cleanBarcode)

    if (!offProduct) {
      return res.status(404).json({
        success: false,
        message: "Product not found in Open Food Facts database",
      })
    }

    // Check if the user already has this product
    let existingFoodItem = await FoodItem.findOne({
      user: req.user._id,
      name: offProduct.name,
      // You might want to also check by barcode if you add it to the schema
    })

    if (existingFoodItem) {
      // Update existing item quantity
      existingFoodItem.quantities[location] += parseFloat(quantity)
      await existingFoodItem.save()

      return res.json({
        success: true,
        message: "Product quantity updated",
        foodItem: existingFoodItem,
        fromOpenFoodFacts: true,
      })
    }

    // Create new food item from Open Food Facts data
    const foodItemData = {
      name: offProduct.name,
      category: [offProduct.mainCategory],
      unit: unit,
      calories: offProduct.nutrition.calories,
      user: req.user._id,
      quantities: {
        meal: location === "meal" ? parseFloat(quantity) : 0,
        "shopping-list": location === "shopping-list" ? parseFloat(quantity) : 0,
        pantry: location === "pantry" ? parseFloat(quantity) : 0,
      },
      // Store Open Food Facts data for reference
      openFoodFactsData: {
        barcode: offProduct.barcode,
        brands: offProduct.brands,
        nutritionGrade: offProduct.nutritionGrade,
        novaGroup: offProduct.novaGroup,
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
    })
  } catch (error) {
    console.error("Error in addToFoodItems:", error)
    res.status(500).json({
      success: false,
      message: "Failed to add product to food items",
      error: error.message,
    })
  }
}

/**
 * Enrich existing food item with Open Food Facts data
 */
exports.enrichFoodItem = async (req, res) => {
  try {
    const { foodItemId } = req.params
    const { barcode } = req.body

    if (!barcode) {
      return res.status(400).json({
        success: false,
        message: "Barcode is required",
      })
    }

    // Find the food item
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

    // Get Open Food Facts data
    const cleanBarcode = openFoodFactsService.cleanBarcode(barcode)
    const offProduct = await openFoodFactsService.searchByBarcode(cleanBarcode)

    if (!offProduct) {
      return res.status(404).json({
        success: false,
        message: "Product not found in Open Food Facts database",
      })
    }

    // Update food item with Open Food Facts data
    foodItem.calories = offProduct.nutrition.calories || foodItem.calories
    foodItem.category = [...new Set([...foodItem.category, offProduct.mainCategory])]
    foodItem.openFoodFactsData = {
      barcode: offProduct.barcode,
      brands: offProduct.brands,
      nutritionGrade: offProduct.nutritionGrade,
      novaGroup: offProduct.novaGroup,
      imageUrl: offProduct.imageUrl,
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
  } catch (error) {
    console.error("Error in enrichFoodItem:", error)
    res.status(500).json({
      success: false,
      message: "Failed to enrich food item",
      error: error.message,
    })
  }
}