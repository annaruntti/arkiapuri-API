import mongoose, { Document } from "mongoose";
export interface IPantryItem extends Document {
    name: string;
    quantity: number;
    unit: string;
    expirationDate: Date;
    foodId?: mongoose.Types.ObjectId;
    category: string[];
    calories: number;
    price: number;
    notes?: string;
    addedFrom: "pantry" | "shopping-list";
}
export interface IPantry extends Document {
    userId: mongoose.Types.ObjectId;
    household?: mongoose.Types.ObjectId | null;
    items: IPantryItem[];
    createdAt: Date;
    updatedAt: Date;
    getExpiringItems(days?: number): IPantryItem[];
    findItem(itemName: string): IPantryItem | undefined;
    updateItemQuantity(itemId: mongoose.Types.ObjectId | string, quantity: number): boolean;
}
declare const _default: mongoose.Model<IPantry, {}, {}, {}, mongoose.Document<unknown, {}, IPantry, {}, {}> & IPantry & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=pantry.d.ts.map