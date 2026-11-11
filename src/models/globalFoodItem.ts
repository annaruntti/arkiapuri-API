import mongoose, { Document, Schema } from "mongoose"
import type {
  IFoodItemNutrition,
  IFoodItemOpenFoodFacts,
} from "./foodItem"

export interface IGlobalFoodItem extends Document {
  name: string
  isFood: boolean
  category: string[]
  unit: string
  packageQuantity?: number
  price?: number
  priceSource?: "user" | "open-prices"
  calories?: number
  nutrition?: IFoodItemNutrition
  image?: {
    url?: string
    publicId?: string
  }
  openFoodFactsData?: IFoodItemOpenFoodFacts
  publishedBy: mongoose.Types.ObjectId
  sourceFoodItemId?: mongoose.Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

const globalFoodItemSchema = new Schema<IGlobalFoodItem>(
  {
    name: { type: String, required: true, trim: true },
    isFood: { type: Boolean, default: true },
    category: { type: [String], default: [] },
    unit: { type: String, required: true },
    packageQuantity: { type: Number, min: 0 },
    price: { type: Number },
    priceSource: { type: String, enum: ["user", "open-prices"] },
    calories: { type: Number },
    nutrition: {
      calories: { type: Number },
      proteins: { type: Number },
      carbohydrates: { type: Number },
      sugars: { type: Number },
      fat: { type: Number },
      saturatedFat: { type: Number },
      fiber: { type: Number },
      sodium: { type: Number },
      salt: { type: Number },
    },
    image: {
      url: { type: String },
      publicId: { type: String },
    },
    openFoodFactsData: {
      barcode: String,
      brands: String,
      nutritionGrade: { type: String, enum: ["a", "b", "c", "d", "e"] },
      novaGroup: { type: Number, enum: [1, 2, 3, 4] },
      imageUrl: String,
      quantityLabel: String,
      nutrition: {
        proteins: { type: Number, default: 0 },
        carbohydrates: { type: Number, default: 0 },
        sugars: { type: Number, default: 0 },
        fat: { type: Number, default: 0 },
        saturatedFat: { type: Number, default: 0 },
        fiber: { type: Number, default: 0 },
        sodium: { type: Number, default: 0 },
        salt: { type: Number, default: 0 },
      },
      labels: [String],
      allergens: [String],
      lastUpdated: Date,
    },
    publishedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sourceFoodItemId: {
      type: Schema.Types.ObjectId,
      ref: "FoodItem",
      default: null,
    },
  },
  { timestamps: true }
)

globalFoodItemSchema.index({ name: 1 })
globalFoodItemSchema.index(
  { sourceFoodItemId: 1 },
  { unique: true, partialFilterExpression: { sourceFoodItemId: { $type: "objectId" } } }
)

export default mongoose.model<IGlobalFoodItem>(
  "GlobalFoodItem",
  globalFoodItemSchema
)
