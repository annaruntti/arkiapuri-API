/**
 * Open Food Facts API Service
 */
interface RequestOptions {
    timeout?: number;
    headers?: Record<string, string>;
    [key: string]: unknown;
}
interface Nutrition {
    calories: number;
    proteins: number;
    carbohydrates: number;
    sugars: number;
    fat: number;
    saturatedFat: number;
    fiber: number;
    sodium: number;
    salt: number;
}
export interface FormattedProduct {
    barcode: string;
    name: string;
    brands: string;
    quantity: string;
    categories: string[];
    mainCategory: string;
    nutrition: Nutrition;
    nutritionGrade: string | null;
    novaGroup: number | null;
    imageUrl: string | null;
    imageFrontUrl: string | null;
    labels: string[];
    allergens: string[];
    traces: string[];
    packaging: string[];
    countries: string[];
    ingredients: string;
    source: string;
    lastUpdated: Date;
}
interface SearchResult {
    products: FormattedProduct[];
    count: number;
    page: number;
    pageSize: number;
    totalPages: number;
}
interface CategoryItem {
    id: string;
    name: string;
    key: string;
}
interface SuggestionItem {
    name: string;
    id: string;
}
declare class OpenFoodFactsService {
    private baseURL;
    private defaultHeaders;
    constructor();
    makeRequest(url: string, options?: RequestOptions): Promise<any>;
    searchByBarcode(barcode: string): Promise<FormattedProduct | null>;
    searchByText(query: string, page?: number, pageSize?: number): Promise<SearchResult>;
    searchByCategory(category: string, page?: number, pageSize?: number): Promise<SearchResult>;
    getPopularCategories(): Promise<CategoryItem[]>;
    formatProductData(product: any): FormattedProduct;
    extractMainCategory(categories: string[]): string;
    formatCategoryName(category: string): string;
    getProductSuggestions(partialName: string, limit?: number): Promise<SuggestionItem[]>;
    isValidBarcode(barcode: string): boolean;
    cleanBarcode(barcode: string): string;
}
declare const _default: OpenFoodFactsService;
export default _default;
//# sourceMappingURL=openFoodFactsService.d.ts.map