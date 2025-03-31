const express = require("express")
const cors = require("cors")
const fs = require("fs")
const path = require("path")
const { rateLimiter } = require("./src/middleware/security")
const requestLogger = require("./src/middleware/logger")
const swaggerUi = require("swagger-ui-express")
const swaggerSpec = require("./src/utils/swagger")
const compression = require("compression")
const helmet = require("helmet")
const mongoose = require("mongoose")

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

// Database connection
require("./src/models/db")

const userRouter = require("./src/routes/user")
const mealRouter = require("./src/routes/meal")
const foodItemRouter = require("./src/routes/foodItem")
const shoppingListRouter = require("./src/routes/shoppingList")
const pantryRouter = require("./src/routes/pantry")
const visionRouter = require("./src/routes/vision")

const User = require("./src/models/user")

const app = express()

// Uses helmet() as a function, not just the reference
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'"],
      },
    },
  })
)

// Uses CORS middleware
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.CORS_ORIGIN || "https://my-frontend-url.com" // Replace with actual frontend URL when deployed
        : "http://localhost:8081",
    credentials: true,
  })
)

// Uses JSON middleware
app.use(express.json())

// Creates uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads")
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir)
}

// Adds rate limiter before routes
app.use(rateLimiter)
app.use(requestLogger)

// Adds compression after cors and before routes
if (process.env.NODE_ENV === "production") {
  app.use(compression())
}

// Root route
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to Arkiapuri API",
    version: "1.0.0",
    status: "running",
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  })
})

// API routes
app.use(userRouter)
app.use(mealRouter)
app.use(foodItemRouter)
app.use(shoppingListRouter)
app.use(pantryRouter)
app.use(visionRouter)

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

// Health check route
app.get("/health", async (req, res) => {
  try {
    // Basic health check without MongoDB check
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    })
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    })
  }
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

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
  console.log(`Environment: ${process.env.NODE_ENV}`)
  console.log(
    `CORS enabled for: ${
      process.env.NODE_ENV === "production"
        ? process.env.CORS_ORIGIN
        : "http://localhost:8081"
    }`
  )
})
