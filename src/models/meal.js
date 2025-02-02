const mongoose = require("mongoose")

const mealSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  recipe: {
    type: String,
  },
  difficultyLevel: {
    type: String,
    enum: ["easy", "medium", "hard"],
  },
  cookingTime: {
    type: Number,
  },
  foodItems: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FoodItem",
    },
  ],
})

module.exports = mongoose.model("Meal", mealSchema)
