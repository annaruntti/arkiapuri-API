const mongoose = require("mongoose")

const shoppingListItemSchema = new mongoose.Schema({
  foodId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "FoodItem",
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
  },
  unit: {
    type: String,
    required: true,
  },
  bought: {
    type: Boolean,
    default: false,
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
    items: [shoppingListItemSchema],
  },
  {
    timestamps: true, // This will add createdAt and updatedAt automatically
  }
)

shoppingListSchema.index({ userId: 1 })

module.exports = mongoose.model("ShoppingList", shoppingListSchema)
