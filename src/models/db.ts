import mongoose from "mongoose"
import { migrateMealIngredientRows } from "../helpers/mealIngredients"

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

    await mongoose.connect(uri, options)
    console.log("MongoDB connected successfully")

    await migrateMealIngredientRows()
  } catch (error) {
    console.error("MongoDB connection error:", error)
    process.exit(1)
  }
}

connectDB()

export default mongoose
