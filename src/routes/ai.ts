import { Router } from "express"
import { isAuth } from "../middleware/auth"
import { requireAiAccess } from "../middleware/requireAiAccess"
import { getAiStatus, scanPantry } from "../controllers/aiPantryScan"
import { scanDish } from "../controllers/aiDishFromPhoto"
import { aiRateLimiter } from "../middleware/security"

const router = Router()

/**
 * @swagger
 * tags:
 *   - name: Gemini AI
 *     description: Gemini vision features. Pantry and dish photo scans return reviewable drafts; the client confirms.
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

/**
 * @swagger
 * /ai/dish-from-photo:
 *   post:
 *     tags: [Gemini AI]
 *     summary: Draft a meal from a dish photo
 *     description: |
 *       Sends the image to Gemini and returns a reviewable meal draft
 *       (name, recipe, roles, categories) plus ingredient candidates
 *       enriched from the household catalog and Open Food Facts.
 *       Costs 3 credits. Does not create a meal; the client confirms via POST /meals.
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
 *         description: Meal draft, ingredient candidates, and credit usage
 *       403:
 *         description: Premium required or monthly credit quota exceeded
 *       503:
 *         description: GEMINI_API_KEY missing or global AI budget exceeded
 */

router.get("/ai/entitlement", isAuth, aiRateLimiter, getAiStatus)
router.post("/ai/pantry-scan", isAuth, aiRateLimiter, requireAiAccess("pantry_scan"), scanPantry)
router.post("/ai/dish-from-photo", isAuth, aiRateLimiter, requireAiAccess("dish_from_photo"), scanDish)

export default router
