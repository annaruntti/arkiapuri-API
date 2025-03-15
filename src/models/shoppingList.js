const mongoose = require("mongoose")

const shoppingListItemSchema = new mongoose.Schema({
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
  // Reference to FoodItem if it exists
  foodId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "FoodItem",
  },
})

const shoppingListSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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

module.exports = mongoose.model("ShoppingList", shoppingListSchema)
