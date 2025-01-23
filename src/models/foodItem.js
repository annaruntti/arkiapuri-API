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
})

module.exports = mongoose.model("FoodItem", foodItemSchema)
