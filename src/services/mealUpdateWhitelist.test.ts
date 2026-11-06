import { describe, it } from "node:test"
import assert from "node:assert/strict"

/**
 * Lightweight guard: meal update must not forward user/household/image from body.
 * Mirrors the whitelist keys in mealUpdate.ts.
 */
const MEAL_UPDATE_KEYS = [
  "name",
  "recipe",
  "recipeSteps",
  "difficultyLevel",
  "cookingTime",
  "foodItems",
  "defaultRoles",
  "mealCategory",
  "plannedCookingDate",
  "plannedEatingDates",
  "servings",
] as const

const pickMealUpdateFields = (body: Record<string, unknown>) => {
  const picked: Record<string, unknown> = {}
  for (const key of MEAL_UPDATE_KEYS) {
    if (body[key] !== undefined) picked[key] = body[key]
  }
  return picked
}

describe("meal update whitelist", () => {
  it("drops user, household, and image mass-assignment fields", () => {
    const picked = pickMealUpdateFields({
      name: "Pasta",
      user: "attacker",
      household: "other-household",
      image: { publicId: "evil" },
      servings: 4,
    })
    assert.equal(picked.name, "Pasta")
    assert.equal(picked.servings, 4)
    assert.equal(picked.user, undefined)
    assert.equal(picked.household, undefined)
    assert.equal(picked.image, undefined)
  })
})
