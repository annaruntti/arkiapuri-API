import mongoose, { Document, Schema } from "mongoose"

export type FoodLocation = "meal" | "shopping-list" | "pantry"
export type NutritionGrade = "a" | "b" | "c" | "d" | "e"
export type NovaGroup = 1 | 2 | 3 | 4

export interface IFoodItemNutrition {
  proteins: number
  carbohydrates: number
  sugars: number
  fat: number
  saturatedFat: number
  fiber: number
  sodium: number
  salt: number
}

export interface IFoodItemOpenFoodFacts {
  barcode?: string
  brands?: string
  nutritionGrade?: NutritionGrade
  novaGroup?: NovaGroup
  imageUrl?: string
  nutrition?: IFoodItemNutrition
  labels?: string[]
  allergens?: string[]
  lastUpdated?: Date
}

export interface IFoodItem extends Document {
  name: string
  category: string[]
  unit: string
  price?: number
  calories?: number
  user: mongoose.Types.ObjectId
  locations: FoodLocation[]
  quantities: {
    meal: number
    "shopping-list": number
    pantry: number
  }
  expireDay?: Date
  expirationDate?: Date
  image?: {
    url?: string
    publicId?: string
  }
  openFoodFactsData?: IFoodItemOpenFoodFacts
  createdAt: Date
  updatedAt: Date
  // Methods
  updateLocations(): void
}

const foodItemSchema = new Schema<IFoodItem>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: [String],
      default: [],
    },
    unit: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
    },
    calories: {
      type: Number,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    locations: [
      {
        type: String,
        enum: ["meal", "shopping-list", "pantry"],
      },
    ],
    quantities: {
      meal: { type: Number, default: 0 },
      "shopping-list": { type: Number, default: 0 },
      pantry: { type: Number, default: 0 },
    },
    expireDay: {
      type: Date,
    },
    expirationDate: {
      type: Date,
    },
    image: {
      url: { type: String },
      publicId: { type: String },
    },
    openFoodFactsData: {
      barcode: String,
      brands: String,
      nutritionGrade: {
        type: String,
        enum: ["a", "b", "c", "d", "e"],
      },
      novaGroup: {
        type: Number,
        enum: [1, 2, 3, 4],
      },
      imageUrl: String,
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
  },
  {
    timestamps: true,
  }
)

foodItemSchema.index({ user: 1, locations: 1 })

foodItemSchema.methods.updateLocations = function (this: IFoodItem): void {
  this.locations = (
    Object.entries(this.quantities) as [FoodLocation, number][]
  )
    .filter(([_, quantity]) => quantity > 0)
    .map(([location]) => location)
}

foodItemSchema.pre("save", function (next) {
  this.updateLocations()
  next()
})

export default mongoose.model<IFoodItem>("FoodItem", foodItemSchema)
