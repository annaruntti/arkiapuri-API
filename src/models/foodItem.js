const mongoose = require("mongoose")

const foodItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    category: {
      type: [String],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    expireDay: {
      type: Date,
    },
    price: {
      type: Number,
    },
    calories: {
      type: Number,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    location: {
      type: String,
      enum: ["pantry", "shopping-list"],
    },
    listId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShoppingList",
      default: null,
    },
    expirationDate: {
      type: Date,
    },
    unit: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
)

// Indexes for better query performance
foodItemSchema.index({ user: 1, location: 1 })
foodItemSchema.index({ user: 1, listId: 1 })

module.exports = mongoose.model("FoodItem", foodItemSchema)
