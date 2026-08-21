import { Router } from "express"
import { isAuth } from "../middlewares/auth"
import { requireAiAccess } from "../middlewares/requireAiAccess"
import { getAiStatus, scanPantry } from "../controllers/aiPantryScan"
import { aiRateLimiter } from "../middleware/security"

const router = Router()

/**
 * @swagger
 * tags:
 *   - name: Gemini AI
 *     description: Pantry photo scan with Gemini structured output. Does not write pantry items; the client confirms candidates.
 */

/**
 * @swagger
 * /ai/entitlement:
 *   get:
 *     tags: [Gemini AI]
 *     summary: Get AI plan and remaining credits
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Entitlement and per-feature credit costs
 *       401:
 *         description: Missing or invalid JWT
 */

/**
 * @swagger
 * /ai/pantry-scan:
 *   post:
 *     tags: [Gemini AI]
 *     summary: Detect pantry products from a photo
 *     description: |
 *       Sends the image to Gemini (`gemini-3.5-flash-lite` by default) and returns
 *       reviewable candidates (name, quantity, unit, confidence, catalog match).
 *       Costs 2 credits from the household (or solo user) monthly pool.
 *       Confirmed items are added with POST /pantry/items.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image:
 *                 type: string
 *                 description: Base64 JPEG, PNG or WebP (data URI prefix allowed)
 *               mimeType:
 *                 type: string
 *                 enum: [image/jpeg, image/jpg, image/png, image/webp]
 *     responses:
 *       200:
 *         description: Detected product candidates and credit usage
 *       403:
 *         description: Premium required or monthly credit quota exceeded
 *       503:
 *         description: GEMINI_API_KEY missing or global AI budget exceeded
 */

router.get("/ai/entitlement", isAuth, aiRateLimiter, getAiStatus)
router.post("/ai/pantry-scan", isAuth, aiRateLimiter, requireAiAccess("pantry_scan"), scanPantry)

export default router
