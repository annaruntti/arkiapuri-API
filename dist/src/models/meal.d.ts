import mongoose, { Document } from "mongoose";
export type MealRole = "breakfast" | "lunch" | "snack" | "dinner" | "supper" | "dessert" | "other";
export type MealCategory = "salad" | "pasta" | "soup" | "casserole" | "stew" | "pizza" | "texmex" | "burger" | "steak" | "fish" | "vegetarian" | "other";
export interface IMeal extends Document {
    name: string;
    recipe?: string;
    difficultyLevel?: "easy" | "medium" | "hard";
    cookingTime?: number;
    defaultRoles: string;
    mealCategory: MealCategory;
    plannedCookingDate?: Date;
    plannedEatingDates: Date[];
    createdAt: Date;
    foodItems: mongoose.Types.ObjectId[];
    user: mongoose.Types.ObjectId;
    household?: mongoose.Types.ObjectId | null;
    image?: {
        url?: string;
        publicId?: string;
    };
}
declare const _default: mongoose.Model<IMeal, {}, {}, {}, mongoose.Document<unknown, {}, IMeal, {}, {}> & IMeal & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=meal.d.ts.map