import mongoose, { Document, Schema } from "mongoose"
import {
  VALID_MEAL_CATEGORIES,
  type MealCategory,
} from "./meal"

export interface IGlobalMealIngredient {
  globalFoodId?: mongoose.Types.ObjectId | null
  name: string
  quantity: number
  unit: string
}

export interface IGlobalMeal extends Document {
  name: string
  recipe?: string
  recipeSteps?: string[]
  difficultyLevel?: "easy" | "medium" | "hard"
  cookingTime?: number
  defaultRoles: string
  mealCategory: MealCategory[]
  servings: number
  foodItems: IGlobalMealIngredient[]
  image?: {
    url?: string
    publicId?: string
  }
  publishedBy: mongoose.Types.ObjectId
  sourceMealId?: mongoose.Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

const globalMealIngredientSchema = new Schema<IGlobalMealIngredient>(
  {
    globalFoodId: {
      type: Schema.Types.ObjectId,
      ref: "GlobalFoodItem",
      default: null,
    },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0, default: 1 },
    unit: { type: String, default: "kpl" },
  },
  { _id: false }
)

const globalMealSchema = new Schema<IGlobalMeal>(
  {
    name: { type: String, required: true },
    recipe: { type: String },
    recipeSteps: { type: [String], default: [] },
    difficultyLevel: { type: String, enum: ["easy", "medium", "hard"] },
    cookingTime: { type: Number },
    defaultRoles: { type: String, default: "[]" },
    mealCategory: {
      type: [String],
      enum: VALID_MEAL_CATEGORIES,
      default: [],
    },
    servings: { type: Number, default: 4, min: 1 },
    foodItems: { type: [globalMealIngredientSchema], default: [] },
    image: {
      url: { type: String },
      publicId: { type: String },
    },
    publishedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sourceMealId: {
      type: Schema.Types.ObjectId,
      ref: "Meal",
      default: null,
    },
  },
  { timestamps: true }
)

globalMealSchema.index({ name: 1 })
globalMealSchema.index(
  { sourceMealId: 1 },
  { unique: true, partialFilterExpression: { sourceMealId: { $type: "objectId" } } }
)

export default mongoose.model<IGlobalMeal>("GlobalMeal", globalMealSchema)
