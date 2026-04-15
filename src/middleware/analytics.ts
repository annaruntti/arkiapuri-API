import { Request, Response, NextFunction } from "express"

const trackApiUsage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const startTime = Date.now()

  res.on("finish", async () => {
    try {
      // Analytics model not yet implemented – placeholder for future use
      console.debug(`Analytics: ${req.method} ${req.path} ${res.statusCode} ${Date.now() - startTime}ms`)
    } catch (error) {
      console.error("Analytics error:", error)
    }
  })

  next()
}

export default trackApiUsage
