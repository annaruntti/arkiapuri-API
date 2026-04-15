import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import User, { IUser } from "../models/user"

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: IUser
    }
  }
}

interface JwtPayload {
  userId: string
}

export const isAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (req.headers && req.headers.authorization) {
    const token = req.headers.authorization.split(" ")[1]

    try {
      const decode = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload
      const user = await User.findById(decode.userId).populate("household")
      if (!user) {
        res.json({ success: false, message: "unauthorized access!" })
        return
      }

      req.user = user
      next()
    } catch (error: any) {
      if (error.name === "JsonWebTokenError") {
        res.json({ success: false, message: "unauthorized access!" })
        return
      }
      if (error.name === "TokenExpiredError") {
        res.json({
          success: false,
          message: "sesson expired try sign in!",
        })
        return
      }

      res.json({ success: false, message: "Internal server error!" })
    }
  } else {
    res.json({ success: false, message: "unauthorized access!" })
  }
}
