"use strict";
/**
 * Open Food Facts API Service
 */
Object.defineProperty(exports, "__esModule", { value: true });
class OpenFoodFactsService {
    constructor() {
        this.baseURL = "https://world.openfoodfacts.org";
        this.defaultHeaders = {
            "User-Agent": "Arkiapuri/1.0 (arkiapuri@example.com)",
        };
    }
    async makeRequest(url, options = {}) {
        const requestOptions = {
            ...options,
            headers: {
                ...this.defaultHeaders,
                ...options.headers,
            },
        };
        try {
            const response = await fetch(url, requestOptions);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error("Request failed:", error);
            throw error;
        }
    }
    async searchByBarcode(barcode) {
        try {
            const url = `${this.baseURL}/api/v2/product/${barcode}?fields=code,product_name,brands,categories_tags,quantity,ingredients_text,nutriments,image_url,image_front_url,nutrition_grades,nova_group,labels_tags,allergens_tags,traces_tags,packaging_tags,countries_tags`;
            const data = await this.makeRequest(url);
            if (data.status === 1 && data.product) {
                return this.formatProductData(data.product);
            }
            return null;
        }
        catch (error) {
            console.error("Error searching by barcode:", error.message);
            throw new Error("Failed to search product by barcode");
        }
    }
    async searchByText(query, page = 1, pageSize = 20) {
        try {
            const url = `${this.baseURL}/cgi/search.pl?search_simple=1&search_terms=${encodeURIComponent(query)}&page=${page}&page_size=${pageSize}&json=1&fields=code,product_name,brands,categories_tags,quantity,image_url,image_front_url,nutrition_grades,nova_group,labels_tags,countries_tags`;
            const data = await this.makeRequest(url);
            if (data && data.products) {
                return {
                    products: data.products.map((product) => this.formatProductData(product)),
                    count: data.count || 0,
                    page: data.page || 1,
                    pageSize: data.page_size || pageSize,
                    totalPages: Math.ceil((data.count || 0) / pageSize),
                };
            }
            return { products: [], count: 0, page: 1, pageSize, totalPages: 0 };
        }
        catch (error) {
            console.error("Error searching by text:", error.message);
            throw new Error("Failed to search products by text");
        }
    }
    async searchByCategory(category, page = 1, pageSize = 20) {
        try {
            const url = `${this.baseURL}/api/v2/search?categories_tags_en=${encodeURIComponent(category)}&page=${page}&page_size=${pageSize}&fields=code,product_name,brands,categories_tags,quantity,image_url,image_front_url,nutrition_grades,nova_group,labels_tags,countries_tags`;
            const data = await this.makeRequest(url);
            if (data && data.products) {
                return {
                    products: data.products.map((product) => this.formatProductData(product)),
                    count: data.count || 0,
                    page: data.page || 1,
                    pageSize: data.page_size || pageSize,
                    totalPages: Math.ceil((data.count || 0) / pageSize),
                };
            }
            return { products: [], count: 0, page: 1, pageSize, totalPages: 0 };
        }
        catch (error) {
            console.error("Error searching by category:", error.message);
            throw new Error("Failed to search products by category");
        }
    }
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
            ];
            return categories.map((category) => ({
                id: category,
                name: this.formatCategoryName(category),
                key: category,
            }));
        }
        catch (error) {
            console.error("Error getting categories:", error.message);
            return [];
        }
    }
    formatProductData(product) {
        const nutrients = product.nutriments || {};
        return {
            barcode: product.code,
            name: product.product_name || "Unknown Product",
            brands: product.brands || "",
            quantity: product.quantity || "",
            categories: product.categories_tags || [],
            mainCategory: this.extractMainCategory(product.categories_tags),
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
            nutritionGrade: product.nutrition_grades || null,
            novaGroup: product.nova_group || null,
            imageUrl: product.image_url || product.image_front_url || null,
            imageFrontUrl: product.image_front_url || null,
            labels: product.labels_tags || [],
            allergens: product.allergens_tags || [],
            traces: product.traces_tags || [],
            packaging: product.packaging_tags || [],
            countries: product.countries_tags || [],
            ingredients: product.ingredients_text || "",
            source: "openfoodfacts",
            lastUpdated: new Date(),
        };
    }
    extractMainCategory(categories) {
        if (!categories || categories.length === 0)
            return "other";
        const cleanCategories = categories
            .map((cat) => cat.replace("en:", ""))
            .filter((cat) => !cat.includes("plant-based-foods-and-beverages"));
        return cleanCategories[cleanCategories.length - 1] || "other";
    }
    formatCategoryName(category) {
        return category.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
    }
    async getProductSuggestions(partialName, limit = 10) {
        try {
            const url = `${this.baseURL}/cgi/suggest.pl?lc=en&tagtype=products&string=${encodeURIComponent(partialName)}`;
            const data = await this.makeRequest(url);
            if (data && Array.isArray(data)) {
                return data.slice(0, limit).map((suggestion) => ({
                    name: suggestion.name || suggestion,
                    id: suggestion.id || suggestion,
                }));
            }
            return [];
        }
        catch (error) {
            console.error("Error getting product suggestions:", error.message);
            return [];
        }
    }
    isValidBarcode(barcode) {
        const cleanBarcode = barcode.replace(/[\s-]/g, "");
        return /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(cleanBarcode);
    }
    cleanBarcode(barcode) {
        return barcode.replace(/[\s-]/g, "");
    }
}
exports.default = new OpenFoodFactsService();
//# sourceMappingURL=openFoodFactsService.js.map