import mongoose, { Document } from "mongoose";
export interface IShoppingListItem extends Document {
    name: string;
    estimatedPrice?: number;
    price?: number;
    quantity: number;
    unit: string;
    category: string[];
    calories: number;
    bought: boolean;
    foodId?: mongoose.Types.ObjectId;
}
export interface IShoppingList extends Document {
    userId: mongoose.Types.ObjectId;
    household?: mongoose.Types.ObjectId | null;
    name: string;
    description?: string;
    items: IShoppingListItem[];
    totalEstimatedPrice: number;
    createdAt: Date;
    updatedAt: Date;
}
declare const _default: mongoose.Model<IShoppingList, {}, {}, {}, mongoose.Document<unknown, {}, IShoppingList, {}, {}> & IShoppingList & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=shoppingList.d.ts.map