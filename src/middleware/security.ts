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

  aiRateLimiter: createLimiter(
    FIFTEEN_MINUTES,
    20,
    "Liian monta AI-pyyntöä. Yritä hetken kuluttua uudelleen."
  ),

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
