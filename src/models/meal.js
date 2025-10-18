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
  defaultRoles: {
    type: String,
    required: true,
    get: function (v) {
      try {
        return JSON.parse(v)
      } catch (e) {
        return ["dinner"] // Fallback if parsing fails
      }
    },
    set: function (v) {
      // Check is it an array
      const roles = Array.isArray(v) ? v : [v]
      // Validate roles
      const validRoles = [
        "breakfast",
        "lunch",
        "snack",
        "dinner",
        "supper",
        "dessert",
        "other",
      ]

      // Filter out invalid roles
      const filteredRoles = roles.filter((role) => validRoles.includes(role))

      // If no valid roles, use default
      if (filteredRoles.length === 0) {
        return JSON.stringify(["dinner"])
      }

      return JSON.stringify(filteredRoles)
    },
    validate: {
      validator: function (v) {
        try {
          const roles = JSON.parse(v)
          return Array.isArray(roles) && roles.length > 0
        } catch (e) {
          return false
        }
      },
      message: "At least one valid meal role is required",
    },
  },
  plannedCookingDate: {
    type: Date,
  },
  plannedEatingDates: {
    type: [Date],
    default: [],
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
  image: {
    url: {
      type: String,
    },
    publicId: {
      type: String,
    },
  },
})

// Enable getters
mealSchema.set("toJSON", { getters: true })
mealSchema.set("toObject", { getters: true })

// Create indexes for query performance
mealSchema.index({ user: 1 })
mealSchema.index({ user: 1, name: 1 })

module.exports = mongoose.model("Meal", mealSchema)
