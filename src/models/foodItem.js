const mongoose = require("mongoose")

const foodItemSchema = new mongoose.Schema({
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
})

foodItemSchema.index({ user: 1 })

module.exports = mongoose.model("FoodItem", foodItemSchema)
