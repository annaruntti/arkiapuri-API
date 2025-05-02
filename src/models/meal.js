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

// Enable getters
mealSchema.set("toJSON", { getters: true })
mealSchema.set("toObject", { getters: true })

mealSchema.pre("save", function (next) {
  console.log("Pre-save meal data:", {
    defaultRoles: this.defaultRoles,
    isArray: Array.isArray(this.defaultRoles),
    length: this.defaultRoles?.length,
  })
  next()
})

// Update index to use _id instead of id
mealSchema.index({ user: 1 }, { unique: false })

module.exports = mongoose.model("Meal", mealSchema)
