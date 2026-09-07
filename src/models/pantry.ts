import mongoose, { Document, Schema } from "mongoose"

export const PANTRY_LOCATION_TYPES = ["fridge", "freezer", "cupboard"] as const
export type PantryLocationType = (typeof PANTRY_LOCATION_TYPES)[number]

export type PantryRemovalReason = "expired" | "missing_from_photo"

export interface IPantryLocation extends Document {
  type: PantryLocationType
  name: string
}

export interface IPantryRemovalSuggestion extends Document {
  itemId: mongoose.Types.ObjectId
  reason: PantryRemovalReason
  locationId?: mongoose.Types.ObjectId | null
  createdAt: Date
  dismissedAt?: Date | null
}

export interface IPantryItem extends Document {
  name: string
  quantity: number
  unit: string
  expirationDate?: Date | null
  expirationDateSetByUser: boolean
  locationId?: mongoose.Types.ObjectId | null
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
  locations: IPantryLocation[]
  removalSuggestions: IPantryRemovalSuggestion[]
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
  expirationDateSetByUser: {
    type: Boolean,
    default: false,
  },
  locationId: {
    type: Schema.Types.ObjectId,
    default: null,
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

const pantryLocationSchema = new Schema<IPantryLocation>({
  type: {
    type: String,
    enum: PANTRY_LOCATION_TYPES,
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
})

const pantryRemovalSuggestionSchema = new Schema<IPantryRemovalSuggestion>({
  itemId: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  reason: {
    type: String,
    enum: ["expired", "missing_from_photo"],
    required: true,
  },
  locationId: {
    type: Schema.Types.ObjectId,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  dismissedAt: {
    type: Date,
    default: null,
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
    locations: {
      type: [pantryLocationSchema],
      default: [],
    },
    removalSuggestions: {
      type: [pantryRemovalSuggestionSchema],
      default: [],
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
