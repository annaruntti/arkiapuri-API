/**
 * Map Open Food Facts category tags to Arkiapuri category names
 * (same names as in frontend categories.json).
 */

const CATEGORY_RULES: Array<{ name: string; patterns: RegExp[] }> = [
  {
    name: "Maitotuotteet",
    patterns: [
      /^milks?$/,
      /^dair(y|ies)$/,
      /cheeses?/,
      /yogurt/,
      /yoghurt/,
      /^cream$/,
      /butter/,
      /maito/,
      /juusto/,
      /dairy-drinks/,
      /milk-drinks/,
    ],
  },
  {
    name: "Kala",
    patterns: [/fishes?/, /seafood/, /salmon/, /tuna/, /kala/],
  },
  {
    name: "Liha",
    patterns: [/meats?/, /poultry/, /chicken/, /beef/, /pork/, /liha/],
  },
  {
    name: "Kasvikset",
    patterns: [
      /vegetables?/,
      /fruits?/,
      /fruits-and-vegetables/,
      /kasvis/,
      /hedelm/,
      /peach/,
      /persikka/,
    ],
  },
  {
    name: "Kasviproteiinit",
    patterns: [
      /legumes?/,
      /pulses?/,
      /tofu/,
      /tempeh/,
      /plant-based-meat/,
      /soya/,
      /soy/,
    ],
  },
  {
    name: "Kuiva-aineet",
    patterns: [/cereals?/, /pasta/, /rice/, /breads?/, /flours?/, /grains?/, /kuiva/],
  },
  {
    name: "Juomat",
    patterns: [
      // Avoid matching the broad tag "plant-based-foods-and-beverages"
      /^beverages?$/,
      /^drinks?$/,
      /^waters?$/,
      /juices?/,
      /^sodas?$/,
      /soft-drinks/,
      /plant-based-beverages/,
      /juoma/,
    ],
  },
  {
    name: "Mausteet",
    patterns: [/spices?/, /seasonings?/, /sauces?/, /condiments?/, /mauste/],
  },
  {
    name: "Pakasteet",
    patterns: [/\bfrozen\b/, /pakaste/],
  },
  {
    name: "Säilykkeet",
    patterns: [
      /canned/,
      /preserves?/,
      /fruit-and-vegetable-preserves/,
      /canned-fruits?/,
      /canned-vegetables?/,
      /säilyke/,
    ],
  },
  {
    name: "Valmisateriat",
    patterns: [/prepared-meals?/, /ready-meals?/, /valmis/],
  },
  {
    name: "Leivontatarvikkeet",
    patterns: [/baking/, /leivonta/],
  },
]

/** Tags that are too broad to drive a specific Arkiapuri category alone. */
const BROAD_OFF_TAGS = new Set([
  "plant-based-foods-and-beverages",
  "plant-based-foods",
  "foods",
  "groceries",
  "snacks",
  "breakfasts",
  "spreads",
  "plant-based-spreads",
  "sweet-spreads",
])

const CATEGORY_PRIORITY = [
  "Pakasteet",
  "Säilykkeet",
  "Maitotuotteet",
  "Kala",
  "Liha",
  "Kasviproteiinit",
  "Kasvikset",
  "Kuiva-aineet",
  "Juomat",
  "Mausteet",
  "Valmisateriat",
  "Leivontatarvikkeet",
]

const normalizeTag = (tag: string): string =>
  tag
    .replace(/^[a-z]{2}:/, "")
    .replace(/_/g, "-")
    .toLowerCase()
    .trim()

export const mapOpenFoodFactsCategories = (
  categories: string[] = [],
  mainCategory?: string | null
): string[] => {
  const tags = [...categories, mainCategory || ""]
    .filter(Boolean)
    .map((tag) => normalizeTag(String(tag)))
    .filter((tag) => tag && !BROAD_OFF_TAGS.has(tag))

  const matched = new Set<string>()

  for (const tag of tags) {
    for (const rule of CATEGORY_RULES) {
      if (rule.patterns.some((pattern) => pattern.test(tag))) {
        matched.add(rule.name)
      }
    }
  }

  return CATEGORY_PRIORITY.filter((name) => matched.has(name))
}

export interface MappedOpenFoodFactsImage {
  url: string
  publicId?: string
}

export const mapOpenFoodFactsImage = (
  imageUrl?: string | null,
  imageFrontUrl?: string | null
): MappedOpenFoodFactsImage | undefined => {
  const url = imageUrl || imageFrontUrl
  if (!url) return undefined
  return { url }
}

/** Units supported in Arkiapuri food item forms. */
export type AppFoodUnit = "kpl" | "g" | "kg" | "l" | "dl" | "ml" | "tl" | "rkl"

type UnitMapping = AppFoodUnit | { unit: AppFoodUnit; factor: number }

const UNIT_ALIASES: Record<string, UnitMapping> = {
  g: "g",
  gr: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  ml: "ml",
  milliliter: "ml",
  millilitre: "ml",
  milliliters: "ml",
  millilitres: "ml",
  l: "l",
  lt: "l",
  liter: "l",
  litre: "l",
  liters: "l",
  litres: "l",
  dl: "dl",
  cl: { unit: "ml", factor: 10 },
  oz: { unit: "g", factor: 28.3495 },
  "fl oz": { unit: "ml", factor: 29.5735 },
  floz: { unit: "ml", factor: 29.5735 },
  pcs: "kpl",
  pc: "kpl",
  piece: "kpl",
  pieces: "kpl",
  unit: "kpl",
  units: "kpl",
  kpl: "kpl",
  tsp: "tl",
  tbsp: "rkl",
  tl: "tl",
  rkl: "rkl",
}

const normalizeUnitToken = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ")
    .trim()

const resolveUnit = (
  rawUnit: string,
  amount: number
): { unit: AppFoodUnit; quantity: number } => {
  const token = normalizeUnitToken(rawUnit)
  const mapping = UNIT_ALIASES[token] || UNIT_ALIASES[token.replace(/\s/g, "")]

  if (!mapping) {
    return { unit: "kpl", quantity: amount || 1 }
  }

  if (typeof mapping === "string") {
    return { unit: mapping, quantity: amount }
  }

  return {
    unit: mapping.unit,
    quantity: Number((amount * mapping.factor).toFixed(3)),
  }
}

export interface ParsedPackageQuantity {
  unit: AppFoodUnit
  packageQuantity: number
  quantityLabel?: string
}

/**
 * Parse OFF quantity fields into app unit + package size.
 * Supports:
 * - product_quantity + product_quantity_unit
 * - "500 g", "1.5 L", "330ml"
 * - multipacks: "6 x 25 cl"
 */
export const parseOpenFoodFactsQuantity = (input: {
  quantityLabel?: string | null
  productQuantity?: number | string | null
  productQuantityUnit?: string | null
}): ParsedPackageQuantity => {
  const quantityLabel = input.quantityLabel?.trim() || undefined

  if (input.productQuantity != null && input.productQuantityUnit) {
    const amount = parseFloat(String(input.productQuantity).replace(",", "."))
    if (Number.isFinite(amount) && amount > 0) {
      const resolved = resolveUnit(String(input.productQuantityUnit), amount)
      return {
        ...resolved,
        packageQuantity: resolved.quantity,
        quantityLabel,
      }
    }
  }

  if (quantityLabel) {
    const multipack = quantityLabel.match(
      /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Zµ]+)/i
    )
    if (multipack) {
      const count = parseFloat(multipack[1].replace(",", "."))
      const size = parseFloat(multipack[2].replace(",", "."))
      const resolved = resolveUnit(multipack[3], count * size)
      return {
        ...resolved,
        packageQuantity: resolved.quantity,
        quantityLabel,
      }
    }

    const simple = quantityLabel.match(
      /(\d+(?:[.,]\d+)?)\s*([a-zA-Zµ]+)/i
    )
    if (simple) {
      const amount = parseFloat(simple[1].replace(",", "."))
      const resolved = resolveUnit(simple[2], amount)
      return {
        ...resolved,
        packageQuantity: resolved.quantity,
        quantityLabel,
      }
    }
  }

  return {
    unit: "kpl",
    packageQuantity: 1,
    quantityLabel,
  }
}

export interface OpenFoodFactsLikeProduct {
  barcode?: string
  name?: string
  brands?: string
  quantity?: string | null
  productQuantity?: number | string | null
  productQuantityUnit?: string | null
  categories?: string[]
  mainCategory?: string | null
  nutrition?: {
    calories?: number
    proteins?: number
    carbohydrates?: number
    sugars?: number
    fat?: number
    saturatedFat?: number
    fiber?: number
    sodium?: number
    salt?: number
  }
  nutritionGrade?: string | null
  novaGroup?: number | null
  imageUrl?: string | null
  imageFrontUrl?: string | null
  labels?: string[]
  allergens?: string[]
}

/**
 * Normalize OFF product into fields compatible with our FoodItem model.
 */
export const mapOpenFoodFactsToFoodItemFields = (
  product: OpenFoodFactsLikeProduct
) => {
  const category = mapOpenFoodFactsCategories(
    product.categories || [],
    product.mainCategory
  )
  const image = mapOpenFoodFactsImage(product.imageUrl, product.imageFrontUrl)
  const parsedQuantity = parseOpenFoodFactsQuantity({
    quantityLabel: product.quantity,
    productQuantity: product.productQuantity,
    productQuantityUnit: product.productQuantityUnit,
  })

  return {
    name: product.name || "Unknown Product",
    category,
    calories: product.nutrition?.calories || 0,
    unit: parsedQuantity.unit,
    packageQuantity: parsedQuantity.packageQuantity,
    image,
    openFoodFactsData: {
      barcode: product.barcode,
      brands: product.brands,
      nutritionGrade: product.nutritionGrade,
      novaGroup: product.novaGroup,
      imageUrl: image?.url,
      quantityLabel: parsedQuantity.quantityLabel,
      nutrition: {
        proteins: product.nutrition?.proteins || 0,
        carbohydrates: product.nutrition?.carbohydrates || 0,
        sugars: product.nutrition?.sugars || 0,
        fat: product.nutrition?.fat || 0,
        saturatedFat: product.nutrition?.saturatedFat || 0,
        fiber: product.nutrition?.fiber || 0,
        sodium: product.nutrition?.sodium || 0,
        salt: product.nutrition?.salt || 0,
      },
      labels: product.labels,
      allergens: product.allergens,
      lastUpdated: new Date(),
    },
  }
}

