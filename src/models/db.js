const mongoose = require("mongoose")

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI
    if (!uri) {
      throw new Error("MONGODB_URI is not defined in environment variables")
    }

    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
      family: 4, // Use IPv4, skip trying IPv6
    }

    await mongoose.connect(uri, options)
    console.log("MongoDB connected successfully")
  } catch (error) {
    console.error("MongoDB connection error:", error)
    process.exit(1)
  }
}

connectDB()

module.exports = mongoose
