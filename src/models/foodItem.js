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
    // Open Food Facts integration data
    openFoodFactsData: {
      barcode: String,
      brands: String,
      nutritionGrade: {
        type: String,
        enum: ["a", "b", "c", "d", "e"],
      },
      novaGroup: {
        type: Number,
        enum: [1, 2, 3, 4],
      },
      imageUrl: String,
      nutrition: {
        proteins: { type: Number, default: 0 },
        carbohydrates: { type: Number, default: 0 },
        sugars: { type: Number, default: 0 },
        fat: { type: Number, default: 0 },
        saturatedFat: { type: Number, default: 0 },
        fiber: { type: Number, default: 0 },
        sodium: { type: Number, default: 0 },
        salt: { type: Number, default: 0 },
      },
      labels: [String],
      allergens: [String],
      lastUpdated: Date,
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
