import { NextFunction, Request, Response } from "express"

export const requirePlatformAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({ success: false, message: "unauthorized access!" })
    return
  }

  if (req.user.platformRole !== "admin") {
    res.status(403).json({ success: false, message: "Forbidden" })
    return
  }

  next()
}
