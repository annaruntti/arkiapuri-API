const mongoose = require("mongoose")

const foodItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: [String],
      default: [],
    },
    unit: {
      type: String,
      required: true,
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
    locations: [
      {
        type: String,
        enum: ["meal", "shopping-list", "pantry"],
      },
    ],
    quantities: {
      meal: { type: Number, default: 0 },
      "shopping-list": { type: Number, default: 0 },
      pantry: { type: Number, default: 0 },
    },
    expireDay: {
      type: Date,
    },
    expirationDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
)

// Indexes for better query performance
foodItemSchema.index({ user: 1, locations: 1 })

// Add method to update locations based on quantities
foodItemSchema.methods.updateLocations = function () {
  this.locations = Object.entries(this.quantities)
    .filter(([_, quantity]) => quantity > 0)
    .map(([location, _]) => location)
}

// Middleware to update locations before saving
foodItemSchema.pre("save", function (next) {
  this.updateLocations()
  next()
})

module.exports = mongoose.model("FoodItem", foodItemSchema)
