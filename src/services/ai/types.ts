export type AiPlan = "free" | "premium"

export type AiFeature =
  | "pantry_scan"
  | "recipe_suggest"
  | "dish_from_photo"

export type AiOwnerType = "household" | "user"

export type AiDenyCode =
  | "upgrade_required"
  | "quota_exceeded"
  | "budget_exceeded"
  | "household_too_large"
  | "not_configured"

export interface ImageInput {
  base64: string
  mimeType: string
}

export interface LlmStructuredRequest {
  system: string
  user: string
  image?: ImageInput
  schema: Record<string, unknown>
  model?: string
  maxOutputTokens?: number
  thinkingBudget?: number
}

export interface LlmStructuredResult<T> {
  data: T
  model: string
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
}

export interface RawPantryDetection {
  name: string
  confidence: number
  quantityGuess?: number
  unit?: string
  category?: string
  notes?: string
}

export interface PantryScanModelOutput {
  items: RawPantryDetection[]
}

export interface FoodNutrition {
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

export interface CatalogFoodMatch {
  _id: string
  name: string
  category: string[]
  unit: string
  calories?: number
  nutrition?: FoodNutrition
}

export type FoodMatchSource = "catalog" | "openfoodfacts" | "inferred"

export interface NormalizedPantryCandidate {
  name: string
  originalName: string
  confidence: number
  quantity: number
  unit: string
  category: string[]
  foodId: string | null
  alreadyInPantry: boolean
  notes?: string
  calories?: number
  nutrition?: FoodNutrition
  matchSource?: FoodMatchSource
  matchName?: string
  barcode?: string
}

export interface AiEntitlement {
  hasAccess: boolean
  plan: AiPlan
  ownerType: AiOwnerType
  ownerId: string
  creditLimit: number
  creditsUsed: number
  remainingCredits: number
  denyCode?: AiDenyCode
  memberCount?: number
}

export interface AiUsageSnapshot {
  remainingCredits: number
  creditLimit: number
  creditsCharged: number
}
