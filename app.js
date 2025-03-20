const express = require("express")
const cors = require("cors")
const fs = require("fs")
const path = require("path")
const { rateLimiter, helmet } = require("./src/middleware/security")
const requestLogger = require("./src/middleware/logger")
const swaggerUi = require("swagger-ui-express")
const swaggerSpec = require("./src/utils/swagger")
const compression = require("compression")

// Load env variables first
require("dotenv").config()

// Validate environment variables
const validateEnv = () => {
  const required = ["MONGODB_URI", "JWT_SECRET", "CORS_ORIGIN"]
  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    console.error("Missing required environment variables:", missing)
    process.exit(1)
  }
}

validateEnv()

// Now require the database connection
require("./src/models/db")

const userRouter = require("./src/routes/user")
const mealRouter = require("./src/routes/meal")
const foodItemRouter = require("./src/routes/foodItem")
const shoppingListRouter = require("./src/routes/shoppingList")
const pantryRouter = require("./src/routes/pantry")
const visionRouter = require("./src/routes/vision")

const User = require("./src/models/user")

const app = express()

// Use CORS middleware with configuration
app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
)

// Use JSON middleware
app.use(express.json())

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads")
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir)
}

// Add before routes
app.use(helmet)
app.use(rateLimiter)
app.use(requestLogger)

// Add after cors and before routes
if (process.env.NODE_ENV === "production") {
  app.use(compression())
}

// API routes
app.use(userRouter)
app.use(mealRouter)
app.use(foodItemRouter)
app.use(shoppingListRouter)
app.use(pantryRouter)
app.use(visionRouter)

// Add before your routes
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec))

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

// Enhanced health check route
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  })
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
    path: req.originalUrl,
  })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
  console.log(`Environment: ${process.env.NODE_ENV}`)
  console.log(`CORS enabled for: ${process.env.CORS_ORIGIN}`)
})
