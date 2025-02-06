const express = require("express")
const cors = require("cors")

require("dotenv").config()
require("./src/models/db")

const userRouter = require("./src/routes/user")
const mealRouter = require("./src/routes/meal")
const foodItemRouter = require("./src/routes/foodItem")

const User = require("./src/models/user")

const app = express()

// Use CORS middleware
app.use(cors())
// Use JSON middleware
app.use(express.json())

// API routes
app.use(userRouter)
app.use(mealRouter)
app.use(foodItemRouter)

// const test = async (email, password) => {
//   const user = await User.findOne({ email: email })
//   const result = await user.comparePassword(password)
//   console.log(result)
// }

// Basic health check routes
app.get("/health", (req, res) => {
  res.json({ status: "healthy" })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({
    success: false,
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
