const express = require("express")
const router = express.Router()
const { isAuth } = require("../middlewares/auth")
const openFoodFactsController = require("../controllers/openFoodFacts")

/**
 * @swagger
 * components:
 *   schemas:
 *     OpenFoodFactsProduct:
 *       type: object
 *       properties:
 *         barcode:
 *           type: string
 *           description: Product barcode
 *         name:
 *           type: string
 *           description: Product name
 *         brands:
 *           type: string
 *           description: Product brands
 *         quantity:
 *           type: string
 *           description: Product quantity
 *         categories:
 *           type: array
 *           items:
 *             type: string
 *           description: Product categories
 *         mainCategory:
 *           type: string
 *           description: Main product category
 *         nutrition:
 *           type: object
 *           properties:
 *             calories:
 *               type: number
 *             proteins:
 *               type: number
 *             carbohydrates:
 *               type: number
 *             fat:
 *               type: number
 *             fiber:
 *               type: number
 *             sodium:
 *               type: number
 *         nutritionGrade:
 *           type: string
 *           enum: [A, B, C, D, E]
 *           description: Nutri-Score grade
 *         novaGroup:
 *           type: number
 *           enum: [1, 2, 3, 4]
 *           description: NOVA food processing group
 *         imageUrl:
 *           type: string
 *           description: Product image URL
 *         labels:
 *           type: array
 *           items:
 *             type: string
 *           description: Product labels (organic, etc.)
 *         allergens:
 *           type: array
 *           items:
 *             type: string
 *           description: Product allergens
 *         source:
 *           type: string
 *           enum: [openfoodfacts]
 *           description: Data source
 */

/**
 * @swagger
 * /api/openfoodfacts/barcode/{barcode}:
 *   get:
 *     summary: Search product by barcode
 *     tags: [Open Food Facts]
 *     parameters:
 *       - in: path
 *         name: barcode
 *         required: true
 *         schema:
 *           type: string
 *         description: Product barcode (EAN-13, UPC, etc.)
 *     responses:
 *       200:
 *         description: Product found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 product:
 *                   $ref: '#/components/schemas/OpenFoodFactsProduct'
 *       404:
 *         description: Product not found
 *       400:
 *         description: Invalid barcode format
 */
router.get("/barcode/:barcode", openFoodFactsController.searchByBarcode)

/**
 * @swagger
 * /api/openfoodfacts/search:
 *   get:
 *     summary: Search products by text query
 *     tags: [Open Food Facts]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query (minimum 2 characters)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *         description: Number of results per page
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 query:
 *                   type: string
 *                 products:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/OpenFoodFactsProduct'
 *                 count:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 pageSize:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 */
router.get("/search", openFoodFactsController.searchByText)

/**
 * @swagger
 * /api/openfoodfacts/category/{category}:
 *   get:
 *     summary: Search products by category
 *     tags: [Open Food Facts]
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *         description: Product category
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *         description: Number of results per page
 *     responses:
 *       200:
 *         description: Category search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 category:
 *                   type: string
 *                 products:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/OpenFoodFactsProduct'
 *                 count:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 pageSize:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 */
router.get("/category/:category", openFoodFactsController.searchByCategory)

/**
 * @swagger
 * /api/openfoodfacts/categories:
 *   get:
 *     summary: Get popular food categories
 *     tags: [Open Food Facts]
 *     responses:
 *       200:
 *         description: List of popular categories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       key:
 *                         type: string
 */
router.get("/categories", openFoodFactsController.getCategories)

/**
 * @swagger
 * /api/openfoodfacts/suggestions:
 *   get:
 *     summary: Get product name suggestions for autocomplete
 *     tags: [Open Food Facts]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Partial product name (minimum 2 characters)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 20
 *         description: Maximum number of suggestions
 *     responses:
 *       200:
 *         description: Product suggestions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 query:
 *                   type: string
 *                 suggestions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       id:
 *                         type: string
 */
router.get("/suggestions", openFoodFactsController.getSuggestions)

/**
 * @swagger
 * /api/openfoodfacts/add/{barcode}:
 *   post:
 *     summary: Add Open Food Facts product to user's food items
 *     tags: [Open Food Facts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: barcode
 *         required: true
 *         schema:
 *           type: string
 *         description: Product barcode
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               location:
 *                 type: string
 *                 enum: [meal, shopping-list, pantry]
 *                 default: shopping-list
 *                 description: Where to add the product
 *               quantity:
 *                 type: number
 *                 default: 1
 *                 description: Quantity to add
 *               unit:
 *                 type: string
 *                 default: pcs
 *                 description: Unit of measurement
 *     responses:
 *       200:
 *         description: Product added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 foodItem:
 *                   type: object
 *                 fromOpenFoodFacts:
 *                   type: boolean
 *                 openFoodFactsData:
 *                   $ref: '#/components/schemas/OpenFoodFactsProduct'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Product not found in Open Food Facts
 */
router.post("/add/:barcode", isAuth, openFoodFactsController.addToFoodItems)

/**
 * @swagger
 * /api/openfoodfacts/enrich/{foodItemId}:
 *   post:
 *     summary: Enrich existing food item with Open Food Facts data
 *     tags: [Open Food Facts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: foodItemId
 *         required: true
 *         schema:
 *           type: string
 *         description: Food item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - barcode
 *             properties:
 *               barcode:
 *                 type: string
 *                 description: Product barcode to fetch data from
 *     responses:
 *       200:
 *         description: Food item enriched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 foodItem:
 *                   type: object
 *                 openFoodFactsData:
 *                   $ref: '#/components/schemas/OpenFoodFactsProduct'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Food item or product not found
 */
router.post(
  "/enrich/:foodItemId",
  isAuth,
  openFoodFactsController.enrichFoodItem
)

module.exports = router
