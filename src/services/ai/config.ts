import type { AiFeature } from "./types"

export const FEATURE_CREDIT_COST: Record<AiFeature, number> = {
  pantry_scan: 2,
  recipe_suggest: 1,
  dish_from_photo: 3,
}

export const FEATURE_ESTIMATED_USD: Record<AiFeature, number> = {
  pantry_scan: 0.002,
  recipe_suggest: 0.0004,
  dish_from_photo: 0.004,
}

const parsePositiveNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const isTruthyEnv = (value: string | undefined): boolean =>
  ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase())

export const getAiConfig = () => ({
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "",
  model: process.env.AI_MODEL || "gemini-3.5-flash-lite",
  monthlyCreditLimit: parsePositiveNumber(process.env.AI_MONTHLY_CREDIT_LIMIT, 40),
  monthlyBudgetUsd: parsePositiveNumber(process.env.AI_MONTHLY_BUDGET_USD, 20),
  householdMemberLimit: parsePositiveNumber(
    process.env.AI_HOUSEHOLD_MEMBER_LIMIT,
    6
  ),
  grantPremium: isTruthyEnv(process.env.AI_GRANT_PREMIUM),
  inputUsdPerMillion: parsePositiveNumber(process.env.AI_INPUT_USD_PER_MILLION, 0.1),
  outputUsdPerMillion: parsePositiveNumber(
    process.env.AI_OUTPUT_USD_PER_MILLION,
    0.4
  ),
})

export const currentUsagePeriod = (date = new Date()): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`

export const ALLOWED_PANTRY_UNITS = ["kpl", "g", "kg", "l", "dl", "ml"] as const

export const FOOD_CATEGORY_NAMES = [
  "Kasviproteiinit",
  "Kala",
  "Liha",
  "Kasvikset",
  "Maitotuotteet",
  "Kuiva-aineet",
  "Valmisateriat",
  "Säilykkeet",
  "Juomat",
  "Mausteet",
  "Leivontatarvikkeet",
  "Kuivatuotteet",
  "Jääkaappituotteet",
  "Pakasteet",
] as const
