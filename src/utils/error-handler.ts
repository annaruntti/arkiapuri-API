import { Request, Response, NextFunction } from "express"

interface AppError extends Error {
  status?: number
}

const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error(err)

  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  })
}

export default errorHandler
