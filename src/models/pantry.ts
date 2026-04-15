import mongoose, { Document, Schema } from "mongoose"

export interface IPantryItem extends Document {
  name: string
  quantity: number
  unit: string
  expirationDate: Date
  foodId?: mongoose.Types.ObjectId
  category: string[]
  calories: number
  price: number
  notes?: string
  addedFrom: "pantry" | "shopping-list"
}

export interface IPantry extends Document {
  userId: mongoose.Types.ObjectId
  household?: mongoose.Types.ObjectId | null
  items: IPantryItem[]
  createdAt: Date
  updatedAt: Date
  // Methods
  getExpiringItems(days?: number): IPantryItem[]
  findItem(itemName: string): IPantryItem | undefined
  updateItemQuantity(itemId: mongoose.Types.ObjectId | string, quantity: number): boolean
}

const pantryItemSchema = new Schema<IPantryItem>({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
    default: 1,
  },
  unit: {
    type: String,
    required: true,
    default: "kpl",
  },
  expirationDate: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  },
  foodId: {
    type: Schema.Types.ObjectId,
    ref: "FoodItem",
  },
  category: {
    type: [String],
    default: [],
  },
  calories: {
    type: Number,
    default: 0,
  },
  price: {
    type: Number,
    default: 0,
  },
  notes: {
    type: String,
    trim: true,
  },
  addedFrom: {
    type: String,
    enum: ["pantry", "shopping-list"],
    default: "pantry",
  },
})

const pantrySchema = new Schema<IPantry>(
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
    items: [pantryItemSchema],
  },
  {
    timestamps: true,
  }
)

pantrySchema.index({ userId: 1 })
pantrySchema.index({ household: 1 })
pantrySchema.index({ "items.expirationDate": 1 })
pantrySchema.index({ "items.name": 1 })

pantrySchema.methods.getExpiringItems = function (
  this: IPantry,
  days = 7
): IPantryItem[] {
  const expirationDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  return this.items.filter(
    (item) =>
      item.expirationDate <= expirationDate && item.expirationDate > new Date()
  )
}

pantrySchema.methods.findItem = function (
  this: IPantry,
  itemName: string
): IPantryItem | undefined {
  return this.items.find(
    (item) => item.name.toLowerCase() === itemName.toLowerCase()
  )
}

pantrySchema.methods.updateItemQuantity = function (
  this: IPantry,
  itemId: mongoose.Types.ObjectId | string,
  quantity: number
): boolean {
  const item = this.items.find((i) => i._id?.toString() === itemId.toString())
  if (item) {
    item.quantity = Math.max(0, quantity)
    return true
  }
  return false
}

export default mongoose.model<IPantry>("Pantry", pantrySchema)
