/**
 * Open Food Facts API Service
 * Provides methods to search and retrieve food products from Open Food Facts database
 */
class OpenFoodFactsService {
  constructor() {
    this.baseURL = "https://world.openfoodfacts.org"
    this.defaultHeaders = {
      "User-Agent": "Arkiapuri/1.0 (arkiapuri@example.com)",
    }
  }

  /**
   * Make HTTP request with error handling
   * @param {string} url - Request URL
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} Response data
   */
  async makeRequest(url, options = {}) {
    const requestOptions = {
      timeout: 10000,
      headers: {
        ...this.defaultHeaders,
        ...options.headers,
      },
      ...options,
    }

    try {
      const response = await fetch(url, requestOptions)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error("Request failed:", error)
      throw error
    }
  }

  /**
   * Search products by barcode
   * @param {string} barcode - Product barcode (EAN-13 or UPC)
   * @returns {Promise<Object>} Product data or null if not found
   */
  async searchByBarcode(barcode) {
    try {
      const url = `${this.baseURL}/api/v2/product/${barcode}?fields=code,product_name,brands,categories_tags,quantity,ingredients_text,nutriments,image_url,image_front_url,nutrition_grades,nova_group,labels_tags,allergens_tags,traces_tags,packaging_tags,countries_tags`

      const data = await this.makeRequest(url)

      if (data.status === 1 && data.product) {
        return this.formatProductData(data.product)
      }
      return null
    } catch (error) {
      console.error("Error searching by barcode:", error.message)
      throw new Error("Failed to search product by barcode")
    }
  }

  /**
   * Search products by text query
   * @param {string} query - Search query
   * @param {number} page - Page number (default: 1)
   * @param {number} pageSize - Number of results per page (default: 20)
   * @returns {Promise<Object>} Search results
   */
  async searchByText(query, page = 1, pageSize = 20) {
    try {
      const url = `${
        this.baseURL
      }/cgi/search.pl?search_simple=1&search_terms=${encodeURIComponent(
        query
      )}&page=${page}&page_size=${pageSize}&json=1&fields=code,product_name,brands,categories_tags,quantity,image_url,image_front_url,nutrition_grades,nova_group,labels_tags,countries_tags`

      const data = await this.makeRequest(url)

      if (data && data.products) {
        return {
          products: data.products.map((product) =>
            this.formatProductData(product)
          ),
          count: data.count || 0,
          page: data.page || 1,
          pageSize: data.page_size || pageSize,
          totalPages: Math.ceil((data.count || 0) / pageSize),
        }
      }
      return { products: [], count: 0, page: 1, pageSize, totalPages: 0 }
    } catch (error) {
      console.error("Error searching by text:", error.message)
      throw new Error("Failed to search products by text")
    }
  }

  /**
   * Search products by category
   * @param {string} category - Category name
   * @param {number} page - Page number (default: 1)
   * @param {number} pageSize - Number of results per page (default: 20)
   * @returns {Promise<Object>} Search results
   */
  async searchByCategory(category, page = 1, pageSize = 20) {
    try {
      const url = `${
        this.baseURL
      }/api/v2/search?categories_tags_en=${encodeURIComponent(
        category
      )}&page=${page}&page_size=${pageSize}&fields=code,product_name,brands,categories_tags,quantity,image_url,image_front_url,nutrition_grades,nova_group,labels_tags,countries_tags`

      const data = await this.makeRequest(url)

      if (data && data.products) {
        return {
          products: data.products.map((product) =>
            this.formatProductData(product)
          ),
          count: data.count || 0,
          page: data.page || 1,
          pageSize: data.page_size || pageSize,
          totalPages: Math.ceil((data.count || 0) / pageSize),
        }
      }
      return { products: [], count: 0, page: 1, pageSize, totalPages: 0 }
    } catch (error) {
      console.error("Error searching by category:", error.message)
      throw new Error("Failed to search products by category")
    }
  }

  /**
   * Get popular categories
   * @returns {Promise<Array>} List of popular categories
   */
  async getPopularCategories() {
    try {
      const categories = [
        "beverages",
        "dairy",
        "breads",
        "cereals-and-potatoes",
        "fruits-and-vegetables",
        "meat",
        "fish",
        "frozen-foods",
        "prepared-meals",
        "snacks",
        "desserts",
        "condiments",
        "oils-and-fats",
        "baby-foods",
        "plant-based-foods",
      ]

      return categories.map((category) => ({
        id: category,
        name: this.formatCategoryName(category),
        key: category,
      }))
    } catch (error) {
      console.error("Error getting categories:", error.message)
      return []
    }
  }

  /**
   * Format product data to match our app's structure
   * @param {Object} product - Raw product data from Open Food Facts
   * @returns {Object} Formatted product data
   */
  formatProductData(product) {
    const nutrients = product.nutriments || {}

    return {
      // Basic info
      barcode: product.code,
      name: product.product_name || "Unknown Product",
      brands: product.brands || "",
      quantity: product.quantity || "",

      // Categories
      categories: product.categories_tags || [],
      mainCategory: this.extractMainCategory(product.categories_tags),

      // Nutritional information
      nutrition: {
        calories:
          nutrients["energy-kcal_100g"] || nutrients["energy-kcal"] || 0,
        proteins: nutrients["proteins_100g"] || 0,
        carbohydrates: nutrients["carbohydrates_100g"] || 0,
        sugars: nutrients["sugars_100g"] || 0,
        fat: nutrients["fat_100g"] || 0,
        saturatedFat: nutrients["saturated-fat_100g"] || 0,
        fiber: nutrients["fiber_100g"] || 0,
        sodium: nutrients["sodium_100g"] || 0,
        salt: nutrients["salt_100g"] || 0,
      },

      // Quality scores
      nutritionGrade: product.nutrition_grades || null, // A, B, C, D, E
      novaGroup: product.nova_group || null, // 1, 2, 3, 4

      // Images
      imageUrl: product.image_url || product.image_front_url || null,
      imageFrontUrl: product.image_front_url || null,

      // Labels and certifications
      labels: product.labels_tags || [],
      allergens: product.allergens_tags || [],
      traces: product.traces_tags || [],

      // Additional info
      packaging: product.packaging_tags || [],
      countries: product.countries_tags || [],
      ingredients: product.ingredients_text || "",

      // Meta
      source: "openfoodfacts",
      lastUpdated: new Date(),
    }
  }

  /**
   * Extract main category from categories array
   * @param {Array} categories - Categories array
   * @returns {string} Main category
   */
  extractMainCategory(categories) {
    if (!categories || categories.length === 0) return "other"

    // Remove "en:" prefix and find the most specific category
    const cleanCategories = categories
      .map((cat) => cat.replace("en:", ""))
      .filter((cat) => !cat.includes("plant-based-foods-and-beverages"))

    // Return the last (most specific) category, or first if only one
    return cleanCategories[cleanCategories.length - 1] || "other"
  }

  /**
   * Format category name for display
   * @param {string} category - Category key
   * @returns {string} Formatted category name
   */
  formatCategoryName(category) {
    return category.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
  }

  /**
   * Get product suggestions based on partial name
   * @param {string} partialName - Partial product name
   * @param {number} limit - Maximum number of suggestions (default: 10)
   * @returns {Promise<Array>} Array of product suggestions
   */
  async getProductSuggestions(partialName, limit = 10) {
    try {
      const url = `${
        this.baseURL
      }/cgi/suggest.pl?lc=en&tagtype=products&string=${encodeURIComponent(
        partialName
      )}`

      const data = await this.makeRequest(url)

      // Parse the response (it's in a specific format)
      if (data && Array.isArray(data)) {
        return data.slice(0, limit).map((suggestion) => ({
          name: suggestion.name || suggestion,
          id: suggestion.id || suggestion,
        }))
      }
      return []
    } catch (error) {
      console.error("Error getting product suggestions:", error.message)
      return []
    }
  }

  /**
   * Validate barcode format
   * @param {string} barcode - Barcode to validate
   * @returns {boolean} True if valid
   */
  isValidBarcode(barcode) {
    // Remove any spaces or hyphens
    const cleanBarcode = barcode.replace(/[\s-]/g, "")

    // Check if it's a valid EAN-13, UPC-A, or EAN-8
    return /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(cleanBarcode)
  }

  /**
   * Clean and format barcode
   * @param {string} barcode - Raw barcode
   * @returns {string} Cleaned barcode
   */
  cleanBarcode(barcode) {
    return barcode.replace(/[\s-]/g, "")
  }
}

module.exports = new OpenFoodFactsService()
