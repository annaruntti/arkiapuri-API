const express = require("express")
const cors = require("cors")
const fs = require("fs")
const path = require("path")

require("dotenv").config()
require("./src/models/db")

const userRouter = require("./src/routes/user")
const mealRouter = require("./src/routes/meal")
const foodItemRouter = require("./src/routes/foodItem")
const shoppingListRouter = require("./src/routes/shoppingList")
const pantryRouter = require("./src/routes/pantry")
const visionRouter = require("./src/routes/vision")

const User = require("./src/models/user")

const app = express()

// Use CORS middleware
app.use(cors())
// Use JSON middleware
app.use(express.json())

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads")
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir)
}

// API routes
app.use(userRouter)
app.use(mealRouter)
app.use(foodItemRouter)
app.use(shoppingListRouter)
app.use(pantryRouter)
app.use(visionRouter)

// Development route to see all registered routes
if (process.env.NODE_ENV === "development") {
  app.get("/debug/routes", (req, res) => {
    const routes = []
    app._router.stack.forEach((middleware) => {
      if (middleware.route) {
        routes.push({
          path: middleware.route.path,
          methods: Object.keys(middleware.route.methods),
        })
      }
    })
    res.json(routes)
  })
}

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
