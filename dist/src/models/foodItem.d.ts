import mongoose, { Document } from "mongoose";
export type FoodLocation = "meal" | "shopping-list" | "pantry";
export type NutritionGrade = "a" | "b" | "c" | "d" | "e";
export type NovaGroup = 1 | 2 | 3 | 4;
export interface IFoodItemNutrition {
    proteins: number;
    carbohydrates: number;
    sugars: number;
    fat: number;
    saturatedFat: number;
    fiber: number;
    sodium: number;
    salt: number;
}
export interface IFoodItemOpenFoodFacts {
    barcode?: string;
    brands?: string;
    nutritionGrade?: NutritionGrade;
    novaGroup?: NovaGroup;
    imageUrl?: string;
    nutrition?: IFoodItemNutrition;
    labels?: string[];
    allergens?: string[];
    lastUpdated?: Date;
}
export interface IFoodItem extends Document {
    name: string;
    category: string[];
    unit: string;
    price?: number;
    calories?: number;
    user: mongoose.Types.ObjectId;
    locations: FoodLocation[];
    quantities: {
        meal: number;
        "shopping-list": number;
        pantry: number;
    };
    expireDay?: Date;
    expirationDate?: Date;
    image?: {
        url?: string;
        publicId?: string;
    };
    openFoodFactsData?: IFoodItemOpenFoodFacts;
    createdAt: Date;
    updatedAt: Date;
    updateLocations(): void;
}
declare const _default: mongoose.Model<IFoodItem, {}, {}, {}, mongoose.Document<unknown, {}, IFoodItem, {}, {}> & IFoodItem & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=foodItem.d.ts.map