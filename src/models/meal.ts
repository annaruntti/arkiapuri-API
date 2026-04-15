import mongoose, { Document, Schema } from "mongoose"

export type MealRole = "breakfast" | "lunch" | "snack" | "dinner" | "supper" | "dessert" | "other"
export type MealCategory =
  | "salad"
  | "pasta"
  | "soup"
  | "casserole"
  | "stew"
  | "pizza"
  | "texmex"
  | "burger"
  | "steak"
  | "fish"
  | "vegetarian"
  | "other"

export interface IMeal extends Document {
  name: string
  recipe?: string
  difficultyLevel?: "easy" | "medium" | "hard"
  cookingTime?: number
  defaultRoles: string
  mealCategory: MealCategory
  plannedCookingDate?: Date
  plannedEatingDates: Date[]
  createdAt: Date
  foodItems: mongoose.Types.ObjectId[]
  user: mongoose.Types.ObjectId
  household?: mongoose.Types.ObjectId | null
  image?: {
    url?: string
    publicId?: string
  }
}

const mealSchema = new Schema<IMeal>({
  name: {
    type: String,
    required: true,
  },
  recipe: {
    type: String,
  },
  difficultyLevel: {
    type: String,
    enum: ["easy", "medium", "hard"],
  },
  cookingTime: {
    type: Number,
  },
  defaultRoles: {
    type: String,
    required: true,
    get: function (v: string) {
      try {
        return JSON.parse(v)
      } catch (e) {
        return ["dinner"]
      }
    },
    set: function (v: string | string[]) {
      const roles = Array.isArray(v) ? v : [v]
      const validRoles: MealRole[] = [
        "breakfast",
        "lunch",
        "snack",
        "dinner",
        "supper",
        "dessert",
        "other",
      ]
      const filteredRoles = roles.filter((role) =>
        validRoles.includes(role as MealRole)
      )
      if (filteredRoles.length === 0) {
        return JSON.stringify(["dinner"])
      }
      return JSON.stringify(filteredRoles)
    },
    validate: {
      validator: function (v: string) {
        try {
          const roles = JSON.parse(v)
          return Array.isArray(roles) && roles.length > 0
        } catch (e) {
          return false
        }
      },
      message: "At least one valid meal role is required",
    },
  },
  mealCategory: {
    type: String,
    enum: [
      "salad",
      "pasta",
      "soup",
      "casserole",
      "stew",
      "pizza",
      "texmex",
      "burger",
      "steak",
      "fish",
      "vegetarian",
      "other",
    ],
    default: "other",
  },
  plannedCookingDate: {
    type: Date,
  },
  plannedEatingDates: {
    type: [Date],
    default: [],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  foodItems: [
    {
      type: Schema.Types.ObjectId,
      ref: "FoodItem",
    },
  ],
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  household: {
    type: Schema.Types.ObjectId,
    ref: "Household",
    default: null,
  },
  image: {
    url: { type: String },
    publicId: { type: String },
  },
})

mealSchema.set("toJSON", { getters: true })

export default mongoose.model<IMeal>("Meal", mealSchema)
