const mongoose = require("mongoose")

const pantryItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true, // Remove whitespace
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
    type: mongoose.Schema.Types.ObjectId,
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

const pantrySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: [pantryItemSchema],
  },
  {
    timestamps: true,
  }
)

// Indexes
pantrySchema.index({ userId: 1 })
pantrySchema.index({ "items.expirationDate": 1 })
pantrySchema.index({ "items.name": 1 })

// Helper methods
pantrySchema.methods.getExpiringItems = function (days = 7) {
  const expirationDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  return this.items.filter(
    (item) =>
      item.expirationDate <= expirationDate && item.expirationDate > new Date()
  )
}

pantrySchema.methods.findItem = function (itemName) {
  return this.items.find(
    (item) => item.name.toLowerCase() === itemName.toLowerCase()
  )
}

pantrySchema.methods.updateItemQuantity = function (itemId, quantity) {
  const item = this.items.id(itemId)
  if (item) {
    item.quantity = Math.max(0, quantity)
    return true
  }
  return false
}

module.exports = mongoose.model("Pantry", pantrySchema)
