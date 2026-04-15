import express, { Request, Response, NextFunction } from "express"
import cors from "cors"
import fs from "fs"
import path from "path"
import { rateLimiter } from "./src/middleware/security"
import requestLogger from "./src/middleware/logger"
import swaggerUi from "swagger-ui-express"
import swaggerSpec from "./src/utils/swagger"
import compression from "compression"
import helmet from "helmet"

// Load env variables first
import dotenv from "dotenv"
dotenv.config()

// Validate environment variables
const validateEnv = (): void => {
  const required = ["MONGODB_URI", "JWT_SECRET", "CORS_ORIGIN"]
  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    console.error("Missing required environment variables:", missing)
    process.exit(1)
  }

  // Warn about missing social auth credentials (optional)
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.warn(
      "Warning: Google OAuth credentials not configured. Social login will not work."
    )
  }

  // Set default APP_URL if not provided
  if (!process.env.APP_URL) {
    process.env.APP_URL = "http://localhost:3000"
    console.log("APP_URL not set, using default: http://localhost:3000")
  }
}

validateEnv()

// Database connection
import "./src/models/db"

import userRouter from "./src/routes/user"
import authRouter from "./src/routes/auth"
import mealRouter from "./src/routes/meal"
import foodItemRouter from "./src/routes/foodItem"
import shoppingListRouter from "./src/routes/shoppingList"
import pantryRouter from "./src/routes/pantry"
import visionRouter from "./src/routes/vision"
import openFoodFactsRouter from "./src/routes/openFoodFacts"
import householdRouter from "./src/routes/household"

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
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true)

      if (process.env.NODE_ENV === "production") {
        const allowedOrigins = [
          process.env.CORS_ORIGIN || "https://my-frontend-url.com",
        ]
        if (allowedOrigins.includes(origin)) {
          return callback(null, true)
        }
        return callback(new Error("Not allowed by CORS"))
      } else {
        // Development: Allow Expo and localhost
        const allowedOrigins: (string | RegExp)[] = [
          "http://localhost:8081",
          "http://localhost:19006", // Expo web
          "exp://localhost:8081", // Expo Go
          "exp://192.168.50.179:8081", // Expo Go with IP
          /^https?:\/\/.*\.ngrok\.io$/, // ngrok tunnels
          /^exp:\/\/.*/, // Any Expo Go URL
        ]

        const isAllowed = allowedOrigins.some((allowedOrigin) => {
          if (typeof allowedOrigin === "string") {
            return allowedOrigin === origin
          }
          return allowedOrigin.test(origin)
        })

        if (isAllowed) {
          return callback(null, true)
        }

        console.log("CORS blocked origin:", origin)
        return callback(null, true) // Allow all in development for now
      }
    },
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
app.get("/", (req: Request, res: Response) => {
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
app.use("/auth", authRouter)
app.use(mealRouter)
app.use(foodItemRouter)
app.use(shoppingListRouter)
app.use(pantryRouter)
app.use(visionRouter)
app.use("/api/openfoodfacts", openFoodFactsRouter)
app.use(householdRouter)

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec))

// Development route to see all registered routes
if (process.env.NODE_ENV === "development") {
  app.get("/debug/routes", (req: Request, res: Response) => {
    const routes: { path: string; methods: string[] }[] = []
    app._router.stack.forEach((middleware: any) => {
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
app.get("/health", async (req: Request, res: Response) => {
  try {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    })
  } catch (error: any) {
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    })
  }
})

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack)
  res.status(500).json({
    success: false,
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  })
})

// 404 handler
app.use((req: Request, res: Response) => {
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
