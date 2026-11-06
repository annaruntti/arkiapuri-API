import mongoose from "mongoose"
import {
  migrateMealCategoriesToArray,
  migrateMealIngredientRows,
  migrateMealServingsDefault,
} from "../helpers/mealIngredients"
import { migrateCatalogPantryIntoPantryDocs } from "../helpers/pantryHelpers"

const connectDB = async (): Promise<void> => {
  try {
    const uri = process.env.MONGODB_URI
    if (!uri) {
      throw new Error("MONGODB_URI is not defined in environment variables")
    }

    const options = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
    }

    // Explicitly off: sanitizeFilter rewrites legitimate $in/$or/$exists into
    // non-matching $eq and breaks household pantry/meal/list queries.
    // Request bodies are sanitized in app.ts via express-mongo-sanitize instead.
    mongoose.set("sanitizeFilter", false)

    await mongoose.connect(uri, options)
    console.log("MongoDB connected successfully")

    await migrateMealIngredientRows()
    await migrateMealServingsDefault()
    await migrateMealCategoriesToArray()
    await migrateCatalogPantryIntoPantryDocs()
  } catch (error) {
    console.error("MongoDB connection error:", error)
    process.exit(1)
  }
}

connectDB()

export default mongoose
