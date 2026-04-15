import { Request, Response, NextFunction } from "express"

const tierLimits: Record<string, number> = {
  free: 1000,
  basic: 10000,
  pro: 50000,
}

// Note: This middleware is a placeholder – UsageTracker integration pending
const tierLimiter = (req: Request, res: Response, next: NextFunction): void => {
  // TODO: Integrate UsageTracker when fully implemented
  next()
}

export default tierLimiter
