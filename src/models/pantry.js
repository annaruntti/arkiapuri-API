const mongoose = require("mongoose")

const pantryItemSchema = new mongoose.Schema({
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
  expirationDate: {
    type: Date,
    required: true,
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

pantrySchema.index({ userId: 1 })

module.exports = mongoose.model("Pantry", pantrySchema)
