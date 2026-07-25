/**
 * Open Food Facts API Service
 */

interface RequestOptions {
  timeout?: number
  headers?: Record<string, string>
  [key: string]: unknown
}

interface Nutrition {
  calories: number
  proteins: number
  carbohydrates: number
  sugars: number
  fat: number
  saturatedFat: number
  fiber: number
  sodium: number
  salt: number
}

export interface FormattedProduct {
  barcode: string
  name: string
  brands: string
  quantity: string
  productQuantity: number | string | null
  productQuantityUnit: string | null
  categories: string[]
  mainCategory: string
  nutrition: Nutrition
  nutritionGrade: string | null
  novaGroup: number | null
  imageUrl: string | null
  imageFrontUrl: string | null
  labels: string[]
  allergens: string[]
  traces: string[]
  packaging: string[]
  countries: string[]
  ingredients: string
  source: string
  lastUpdated: Date
}

interface SearchResult {
  products: FormattedProduct[]
  count: number
  page: number
  pageSize: number
  totalPages: number
}

interface CategoryItem {
  id: string
  name: string
  key: string
}

interface SuggestionItem {
  name: string
  id: string
}

class OpenFoodFactsService {
  private baseURL: string
  private searchURL: string
  private defaultHeaders: Record<string, string>
  private searchFields: string

  constructor() {
    this.baseURL = "https://world.openfoodfacts.org"
    this.searchURL = "https://search.openfoodfacts.org"
    this.defaultHeaders = {
      "User-Agent": "Arkiapuri/1.0 (arkiapuri@example.com)",
    }
    this.searchFields = [
      "code",
      "product_name",
      "product_name_fi",
      "brands",
      "brands_tags",
      "categories_tags",
      "quantity",
      "product_quantity",
      "product_quantity_unit",
      "image_url",
      "image_front_url",
      "nutrition_grades",
      "nova_group",
      "labels_tags",
      "allergens_tags",
      "countries_tags",
      "nutriments",
    ].join(",")
  }

  async makeRequest(url: string, options: RequestOptions = {}): Promise<any> {
    const requestOptions = {
      ...options,
      headers: {
        ...this.defaultHeaders,
        ...options.headers,
      },
    }

    try {
      const response = await fetch(url, requestOptions as RequestInit)
      const contentType = response.headers.get("content-type") || ""
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      if (!contentType.includes("application/json")) {
        throw new Error(`Unexpected content type: ${contentType}`)
      }
      return await response.json()
    } catch (error) {
      console.error("Request failed:", error)
      throw error
    }
  }

  async searchByBarcode(barcode: string): Promise<FormattedProduct | null> {
    try {
      const url = `${this.baseURL}/api/v2/product/${barcode}?fields=code,product_name,brands,categories_tags,quantity,product_quantity,product_quantity_unit,ingredients_text,nutriments,image_url,image_front_url,nutrition_grades,nova_group,labels_tags,allergens_tags,traces_tags,packaging_tags,countries_tags`
      const data = await this.makeRequest(url)
      if (data.status === 1 && data.product) {
        return this.formatProductData(data.product)
      }
      return null
    } catch (error: any) {
      console.error("Error searching by barcode:", error.message)
      throw new Error("Failed to search product by barcode")
    }
  }

  /**
   * Full-text search via Search-a-licious (recommended), with legacy cgi/search.pl fallback.
   * Results are ranked so product names containing the query come first.
   */
  async searchByText(query: string, page = 1, pageSize = 20): Promise<SearchResult> {
    const trimmed = query.trim()
    try {
      const fetchSize = Math.min(Math.max(pageSize * 3, 24), 50)
      const url =
        `${this.searchURL}/search?q=${encodeURIComponent(trimmed)}` +
        `&page=${page}&page_size=${fetchSize}&langs=fi&fields=${this.searchFields}`

      const data = await this.makeRequest(url)
      const hits = Array.isArray(data?.hits) ? data.hits : []
      const ranked = this.rankSearchHits(hits, trimmed).slice(0, pageSize)
      const count = Number(data?.count) || ranked.length

      return {
        products: ranked.map((product) => this.formatProductData(product)),
        count,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(count / pageSize)),
      }
    } catch (primaryError: any) {
      console.warn(
        "Search-a-licious failed, falling back to cgi/search.pl:",
        primaryError.message
      )
      return this.searchByTextLegacy(trimmed, page, pageSize)
    }
  }

  private async searchByTextLegacy(
    query: string,
    page = 1,
    pageSize = 20
  ): Promise<SearchResult> {
    try {
      const fetchSize = Math.min(Math.max(pageSize * 3, 24), 50)
      const url =
        `${this.baseURL}/cgi/search.pl?action=process&search_simple=1` +
        `&search_terms=${encodeURIComponent(query)}&page=${page}` +
        `&page_size=${fetchSize}&json=1&lc=fi&cc=fi` +
        `&fields=${this.searchFields}`

      const data = await this.makeRequest(url)
      const products = Array.isArray(data?.products) ? data.products : []
      const ranked = this.rankSearchHits(products, query).slice(0, pageSize)
      const count = Number(data?.count) || ranked.length

      return {
        products: ranked.map((product) => this.formatProductData(product)),
        count,
        page: Number(data?.page) || page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(count / pageSize)),
      }
    } catch (error: any) {
      console.error("Error searching by text:", error.message)
      throw new Error("Failed to search products by text")
    }
  }

  private rankSearchHits(hits: any[], query: string): any[] {
    const queryLower = query.toLowerCase().trim()
    if (!queryLower || hits.length === 0) return hits

    const scored = hits.map((hit, index) => {
      const name = this.getProductDisplayName(hit).toLowerCase()
      const brands = this.normalizeBrands(hit.brands).toLowerCase()
      const inFinland = (hit.countries_tags || []).some(
        (tag: string) =>
          String(tag).includes("finland") || String(tag).includes("suomi")
      )

      let rank = 50
      if (name === queryLower) rank = 0
      else if (name.startsWith(queryLower)) rank = 1
      else if (name.includes(queryLower)) rank = 2
      else if (brands.includes(queryLower)) rank = 10
      else rank = 40

      return { hit, rank, inFinland, index }
    })

    const nameMatches = scored.filter((item) => item.rank <= 2)
    const brandMatches = scored.filter((item) => item.rank === 10)
    const otherMatches = scored.filter((item) => item.rank > 10)

    const byRelevance = (a: typeof scored[number], b: typeof scored[number]) =>
      a.rank - b.rank ||
      Number(b.inFinland) - Number(a.inFinland) ||
      a.index - b.index

    // Name hits first; fill remaining slots with brand hits (useful for "leipä"),
    // and only then fall back to weaker OFF matches.
    const ranked = [
      ...nameMatches.sort(byRelevance),
      ...brandMatches.sort(byRelevance),
      ...(nameMatches.length === 0 && brandMatches.length === 0
        ? otherMatches.sort(byRelevance)
        : []),
    ]

    return ranked.map((item) => item.hit)
  }

  private getProductDisplayName(product: any): string {
    return (
      product.product_name_fi ||
      product.product_name ||
      product.name ||
      ""
    )
  }

  private normalizeBrands(brands: unknown): string {
    if (Array.isArray(brands)) {
      return brands.filter(Boolean).join(", ")
    }
    return typeof brands === "string" ? brands : ""
  }

  async searchByCategory(category: string, page = 1, pageSize = 20): Promise<SearchResult> {
    try {
      const url = `${this.baseURL}/api/v2/search?categories_tags_en=${encodeURIComponent(category)}&page=${page}&page_size=${pageSize}&fields=code,product_name,brands,categories_tags,quantity,product_quantity,product_quantity_unit,image_url,image_front_url,nutrition_grades,nova_group,labels_tags,countries_tags`
      const data = await this.makeRequest(url)
      if (data && data.products) {
        return {
          products: data.products.map((product: any) => this.formatProductData(product)),
          count: data.count || 0,
          page: data.page || 1,
          pageSize: data.page_size || pageSize,
          totalPages: Math.ceil((data.count || 0) / pageSize),
        }
      }
      return { products: [], count: 0, page: 1, pageSize, totalPages: 0 }
    } catch (error: any) {
      console.error("Error searching by category:", error.message)
      throw new Error("Failed to search products by category")
    }
  }

  async getPopularCategories(): Promise<CategoryItem[]> {
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
    } catch (error: any) {
      console.error("Error getting categories:", error.message)
      return []
    }
  }

  formatProductData(product: any): FormattedProduct {
    const nutrients = product.nutriments || {}
    return {
      barcode: product.code || product.barcode,
      name: this.getProductDisplayName(product) || "Unknown Product",
      brands: this.normalizeBrands(product.brands),
      quantity: product.quantity || "",
      productQuantity:
        product.product_quantity != null
          ? product.product_quantity
          : product.productQuantity != null
            ? product.productQuantity
            : null,
      productQuantityUnit:
        product.product_quantity_unit || product.productQuantityUnit || null,
      categories: product.categories_tags || product.categories || [],
      mainCategory: this.extractMainCategory(
        product.categories_tags || product.categories || []
      ),
      nutrition: {
        calories: nutrients["energy-kcal_100g"] || nutrients["energy-kcal"] || 0,
        proteins: nutrients["proteins_100g"] || 0,
        carbohydrates: nutrients["carbohydrates_100g"] || 0,
        sugars: nutrients["sugars_100g"] || 0,
        fat: nutrients["fat_100g"] || 0,
        saturatedFat: nutrients["saturated-fat_100g"] || 0,
        fiber: nutrients["fiber_100g"] || 0,
        sodium: nutrients["sodium_100g"] || 0,
        salt: nutrients["salt_100g"] || 0,
      },
      nutritionGrade: product.nutrition_grades || product.nutritionGrade || null,
      novaGroup: product.nova_group || product.novaGroup || null,
      imageUrl: product.image_url || product.image_front_url || product.imageUrl || null,
      imageFrontUrl: product.image_front_url || product.imageFrontUrl || null,
      labels: product.labels_tags || product.labels || [],
      allergens: product.allergens_tags || product.allergens || [],
      traces: product.traces_tags || product.traces || [],
      packaging: product.packaging_tags || product.packaging || [],
      countries: product.countries_tags || product.countries || [],
      ingredients: product.ingredients_text || product.ingredients || "",
      source: "openfoodfacts",
      lastUpdated: new Date(),
    }
  }

  extractMainCategory(categories: string[]): string {
    if (!categories || categories.length === 0) return "other"
    const cleanCategories = categories
      .map((cat) => cat.replace("en:", ""))
      .filter((cat) => !cat.includes("plant-based-foods-and-beverages"))
    return cleanCategories[cleanCategories.length - 1] || "other"
  }

  formatCategoryName(category: string): string {
    return category.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
  }

  async getProductSuggestions(partialName: string, limit = 10): Promise<SuggestionItem[]> {
    try {
      const url = `${this.baseURL}/cgi/suggest.pl?lc=en&tagtype=products&string=${encodeURIComponent(partialName)}`
      const data = await this.makeRequest(url)
      if (data && Array.isArray(data)) {
        return data.slice(0, limit).map((suggestion: any) => ({
          name: suggestion.name || suggestion,
          id: suggestion.id || suggestion,
        }))
      }
      return []
    } catch (error: any) {
      console.error("Error getting product suggestions:", error.message)
      return []
    }
  }

  isValidBarcode(barcode: string): boolean {
    const cleanBarcode = barcode.replace(/[\s-]/g, "")
    return /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(cleanBarcode)
  }

  cleanBarcode(barcode: string): string {
    return barcode.replace(/[\s-]/g, "")
  }
}

export default new OpenFoodFactsService()
