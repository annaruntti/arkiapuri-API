import helmet from "helmet"
import rateLimit from "express-rate-limit"

const jsonMessage = (message: string) => ({
  success: false,
  message,
})

const createLimiter = (windowMs: number, limit: number, message: string) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: jsonMessage(message),
  })

const FIFTEEN_MINUTES = 15 * 60 * 1000

const securityMiddleware = {
  rateLimiter: createLimiter(
    FIFTEEN_MINUTES,
    300,
    "Too many requests from this IP, please try again later."
  ),

  authRateLimiter: createLimiter(
    FIFTEEN_MINUTES,
    10,
    "Liian monta kirjautumis- tai salasanayritystä. Yritä hetken kuluttua uudelleen."
  ),

  openFoodFactsRateLimiter: createLimiter(
    FIFTEEN_MINUTES,
    60,
    "Liian monta tuotetta koskevaa hakua. Yritä hetken kuluttua uudelleen."
  ),

  aiRateLimiter: rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: jsonMessage(
      "Liian monta AI-pyyntöä. Yritä hetken kuluttua uudelleen."
    ),
    keyGenerator: (req) => {
      const userId = (req as { user?: { _id?: unknown } }).user?._id
      if (userId) return `ai:user:${String(userId)}`
      return `ai:ip:${req.ip || "unknown"}`
    },
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

export const {
  rateLimiter,
  authRateLimiter,
  openFoodFactsRateLimiter,
  aiRateLimiter,
} = securityMiddleware
export default securityMiddleware
