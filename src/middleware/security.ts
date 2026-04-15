import { Request, Response, NextFunction } from "express"
import helmet from "helmet"
import rateLimit from "express-rate-limit"

const securityMiddleware = {
  rateLimiter: rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Too many requests from this IP, please try again later.",
  }),

  helmet: helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'"],
      },
    },
  }),
}

export const { rateLimiter } = securityMiddleware
export default securityMiddleware
