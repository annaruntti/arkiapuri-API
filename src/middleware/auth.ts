import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import User, { IUser } from "../models/user"
import type { AuthTokenPayload } from "../helpers/authToken"

declare global {
  namespace Express {
    interface Request {
      user?: IUser
    }
  }
}

const unauthorized = (res: Response, message = "unauthorized access!") => {
  res.status(401).json({ success: false, message })
}

const getBearerToken = (header?: string): string | null => {
  if (!header) return null
  if (header.startsWith("Bearer ")) return header.slice(7).trim() || null
  const parts = header.split(" ")
  return parts[1] || null
}

export const isAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = getBearerToken(req.headers?.authorization)

  if (!token) {
    unauthorized(res)
    return
  }

  try {
    const decode = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as AuthTokenPayload

    const user = await User.findById(decode.userId).populate("household")
    if (!user) {
      unauthorized(res)
      return
    }

    const tokenVersion = Number(decode.tokenVersion) || 0
    const currentVersion = Number(user.tokenVersion) || 0
    if (tokenVersion !== currentVersion) {
      unauthorized(res)
      return
    }

    req.user = user
    next()
  } catch (error: unknown) {
    const name = error instanceof Error ? error.name : ""
    if (name === "TokenExpiredError") {
      unauthorized(res, "sesson expired try sign in!")
      return
    }
    if (name === "JsonWebTokenError") {
      unauthorized(res)
      return
    }

    console.error("Auth error:", error)
    res.status(500).json({ success: false, message: "Internal server error!" })
  }
}
