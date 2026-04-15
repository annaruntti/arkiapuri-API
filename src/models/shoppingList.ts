import mongoose, { Document, Schema } from "mongoose"

export interface IShoppingListItem extends Document {
  name: string
  estimatedPrice?: number
  price?: number
  quantity: number
  unit: string
  category: string[]
  calories: number
  bought: boolean
  foodId?: mongoose.Types.ObjectId
}

export interface IShoppingList extends Document {
  userId: mongoose.Types.ObjectId
  household?: mongoose.Types.ObjectId | null
  name: string
  description?: string
  items: IShoppingListItem[]
  totalEstimatedPrice: number
  createdAt: Date
  updatedAt: Date
}

const shoppingListItemSchema = new Schema<IShoppingListItem>({
  name: {
    type: String,
    required: true,
  },
  estimatedPrice: {
    type: Number,
    min: 0,
  },
  price: {
    type: Number,
    min: 0,
  },
  quantity: {
    type: Number,
    default: 1,
    min: 0,
  },
  unit: {
    type: String,
    default: "kpl",
  },
  category: {
    type: [String],
    default: [],
  },
  calories: {
    type: Number,
    min: 0,
    default: 0,
  },
  bought: {
    type: Boolean,
    default: false,
  },
  foodId: {
    type: Schema.Types.ObjectId,
    ref: "FoodItem",
  },
})

const shoppingListSchema = new Schema<IShoppingList>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    household: {
      type: Schema.Types.ObjectId,
      ref: "Household",
      default: null,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    items: [shoppingListItemSchema],
    totalEstimatedPrice: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
)

shoppingListSchema.index({ userId: 1 })
shoppingListSchema.index({ household: 1 })

export default mongoose.model<IShoppingList>("ShoppingList", shoppingListSchema)
