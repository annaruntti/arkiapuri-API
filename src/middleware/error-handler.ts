import { Request, Response, NextFunction } from "express"

interface AppError extends Error {
  status?: number
  errors?: Record<string, { message: string }>
}

const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error("Error:", {
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
  })

  // Mongoose validation error
  if (err.name === "ValidationError" && err.errors) {
    res.status(400).json({
      error: "Validation Error",
      details: Object.values(err.errors).map((e) => e.message),
    })
    return
  }

  // JWT error
  if (err.name === "JsonWebTokenError") {
    res.status(401).json({
      error: "Invalid token",
    })
    return
  }

  // Default error
  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  })
}

export default errorHandler
