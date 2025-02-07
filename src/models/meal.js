const mongoose = require("mongoose")

const mealSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
  },
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
  defaultRole: {
    type: String,
    enum: ["breakfast", "lunch", "snack", "dinner", "supper"],
  },
  plannedCookingDate: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  foodItems: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FoodItem",
    },
  ],
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
})

mealSchema.index({ user: 1, id: 1 }, { unique: true })

module.exports = mongoose.model("Meal", mealSchema)
