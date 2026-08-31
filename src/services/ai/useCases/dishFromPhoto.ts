/**
 * Draft a saved meal from a dish photo.
 * Gemini returns Finnish names and recipe text; catalog/OFF enrichment
 * fills product data. The API does not persist a meal.
 */
import { VALID_MEAL_CATEGORIES } from "../../../models/meal"
import { enrichPantryCandidates } from "../../foodNameLookup"
import {
  completeStructured,
  dishFromPhotoResponseSchema,
} from "../llmClient"
import { normalizeDishDetections } from "../productNormalizer"
import {
  VALID_MEAL_DIFFICULTIES,
  VALID_MEAL_ROLES,
} from "../config"
import type {
  CatalogFoodMatch,
  DishFromPhotoModelOutput,
  DishMealDraft,
  ImageInput,
  MealDifficulty,
  NormalizedDishIngredient,
} from "../types"

export const DISH_FROM_PHOTO_FEATURE = "dish_from_photo" as const

const ROLE_SET = new Set<string>(VALID_MEAL_ROLES)
const DIFFICULTY_SET = new Set<string>(VALID_MEAL_DIFFICULTIES)
const CATEGORY_SET = new Set<string>(VALID_MEAL_CATEGORIES)

const ROLE_ALIASES: Record<string, string> = {
  aamiainen: "breakfast",
  lounas: "lunch",
  välipala: "snack",
  valipala: "snack",
  päivällinen: "dinner",
  paivallinen: "dinner",
  dinner: "dinner",
  iltapala: "supper",
  jälkiruoka: "dessert",
  jalkiruoka: "dessert",
  muu: "other",
}

const DIFFICULTY_ALIASES: Record<string, MealDifficulty> = {
  easy: "easy",
  helppo: "easy",
  medium: "medium",
  keskitaso: "medium",
  hard: "hard",
  vaikea: "hard",
}

export const DISH_FROM_PHOTO_SYSTEM = `You are Arkiapuri's meal identifier. You identify a cooked dish or plated meal from a photo and propose a meal to save.

Goal: return the dish's Finnish name, estimated ingredients with quantities, and a Finnish recipe. The user will review and edit the suggestion.

Rules:
- Name the dish in Finnish (e.g. "Pasta carbonara", "Lohikeitto", "Kanawokki").
- Use Finnish generic names for ingredients, not tableware (e.g. "kana", "riisi", "tomaattimurska", "oliiviöljy"). Do not guess brands.
- Do not invent nutrition values, calories, barcodes, or packaging labels.
- Distinguish visible vs typical ingredients: visibleInPhoto true only if the ingredient is visible in the photo; false for typical hidden ingredients (oil, salt, pepper, water).
- Do not list plates, cutlery, glasses, garnishes, or background items.
- quantityGuess is an estimate for the given serving count. Unit is one of: kpl, g, kg, ml, dl, l, tl, rkl.
- category is one of: Maitotuotteet, Kasvikset, Liha, Kala, Kasviproteiinit, Kuiva-aineet, Juomat, Mausteet, Säilykkeet, Valmisateriat, Leivontatarvikkeet, Pakasteet.
- confidence 0–1. Use a low value if identification is uncertain.
- recipe is a Finnish cooking instruction in numbered steps. Use the same ingredient names as in the ingredients list.
- servings 1–12, default 4. cookingTime in minutes.
- difficultyLevel is easy, medium, or hard.
- defaultRoles: breakfast, lunch, snack, dinner, supper, dessert, other.
- mealCategory: porridge, pie, sandwich, salad, soup, pasta, pizza, burger, wrap, stew, casserole, asian, texmex, wok, curry, steak, mincedMeat, vegetarian, egg, grill, fish, chicken, lamb, pork, game, dessert, other.`

export const DISH_FROM_PHOTO_USER =
  "Identify the dish in the photo. Return JSON with name, recipe, ingredients, servings, cooking time, difficulty, meal roles, and category."

const clampServings = (value: unknown): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return 4
  return Math.min(12, Math.round(parsed))
}

const clampCookingTime = (value: unknown): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.min(300, Math.round(parsed))
}

const normalizeDifficulty = (value: unknown): MealDifficulty => {
  const raw = String(value || "").trim().toLowerCase()
  if (DIFFICULTY_SET.has(raw)) return raw as MealDifficulty
  return DIFFICULTY_ALIASES[raw] || "medium"
}

const normalizeRoles = (value: unknown): string[] => {
  const list = Array.isArray(value) ? value : [value]
  const roles = list
    .map((entry) => String(entry || "").trim().toLowerCase())
    .map((entry) => ROLE_ALIASES[entry] || entry)
    .filter((entry) => ROLE_SET.has(entry))
  return [...new Set(roles)].length ? [...new Set(roles)] : ["dinner"]
}

const normalizeCategories = (value: unknown): string[] => {
  const list = Array.isArray(value) ? value : [value]
  const categories = list
    .map((entry) => String(entry || "").trim())
    .map((entry) => {
      const exact = VALID_MEAL_CATEGORIES.find(
        (category) => category.toLowerCase() === entry.toLowerCase()
      )
      return exact || ""
    })
    .filter((entry) => CATEGORY_SET.has(entry))
  return [...new Set(categories)]
}

export const normalizeDishMealDraft = (
  data: DishFromPhotoModelOutput
): DishMealDraft => {
  const name = String(data?.name || "").trim() || "Tunnistettu ateria"
  return {
    name,
    recipe: String(data?.recipe || "").trim(),
    servings: clampServings(data?.servings),
    cookingTime: clampCookingTime(data?.cookingTime),
    difficultyLevel: normalizeDifficulty(data?.difficultyLevel),
    defaultRoles: normalizeRoles(data?.defaultRoles),
    mealCategory: normalizeCategories(data?.mealCategory),
  }
}

export const scanDishFromPhoto = async (params: {
  image: ImageInput
  catalog?: CatalogFoodMatch[]
  model?: string
  enrich?: boolean
}): Promise<{
  meal: DishMealDraft
  ingredients: NormalizedDishIngredient[]
  model: string
  estimatedCostUsd: number
  inputTokens: number
  outputTokens: number
}> => {
  const result = await completeStructured<DishFromPhotoModelOutput>({
    system: DISH_FROM_PHOTO_SYSTEM,
    user: DISH_FROM_PHOTO_USER,
    image: params.image,
    schema: dishFromPhotoResponseSchema,
    model: params.model,
    maxOutputTokens: 8192,
  })

  const meal = normalizeDishMealDraft(result.data || {})
  const rawIngredients = Array.isArray(result.data?.ingredients)
    ? result.data.ingredients
    : []
  let ingredients = normalizeDishDetections(
    rawIngredients,
    params.catalog || []
  )

  try {
    if (params.enrich !== false) {
      const enriched = await enrichPantryCandidates(
        ingredients,
        params.catalog || []
      )
      ingredients = enriched.map((item) => ({
        ...item,
        alreadyInPantry: false,
        visibleInPhoto: Boolean(item.visibleInPhoto),
      }))
    }
  } catch (error) {
    console.warn("Dish-from-photo enrichment failed:", error)
  }

  return {
    meal,
    ingredients,
    model: result.model,
    estimatedCostUsd: result.estimatedCostUsd,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  }
}
