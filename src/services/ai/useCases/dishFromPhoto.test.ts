import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { normalizeDishMealDraft } from "./dishFromPhoto"
import { normalizeDishDetections } from "../productNormalizer"

describe("normalizeDishMealDraft", () => {
  it("fills defaults and canonicalizes roles and categories", () => {
    const draft = normalizeDishMealDraft({
      name: "  Pasta carbonara  ",
      recipeSteps: ["Keitä pasta.", "Paista pekoni."],
      servings: 4,
      cookingTime: 25,
      difficultyLevel: "easy",
      defaultRoles: ["dinner", "lunch", "not-a-role"],
      mealCategory: ["pasta", "PASTA", "other"],
      ingredients: [],
    })

    assert.equal(draft.name, "Pasta carbonara")
    assert.deepEqual(draft.recipeSteps, ["Keitä pasta.", "Paista pekoni."])
    assert.equal(draft.recipe, "1. Keitä pasta.\n2. Paista pekoni.")
    assert.equal(draft.servings, 4)
    assert.equal(draft.cookingTime, 25)
    assert.equal(draft.difficultyLevel, "easy")
    assert.deepEqual(draft.defaultRoles, ["dinner", "lunch"])
    assert.deepEqual(draft.mealCategory, ["pasta", "other"])
  })

  it("defaults missing name, servings and role", () => {
    const draft = normalizeDishMealDraft({})
    assert.equal(draft.name, "Tunnistettu ateria")
    assert.equal(draft.servings, 4)
    assert.deepEqual(draft.defaultRoles, ["dinner"])
    assert.equal(draft.difficultyLevel, "medium")
    assert.deepEqual(draft.recipeSteps, [])
  })

  it("splits a legacy recipe string into steps", () => {
    const draft = normalizeDishMealDraft({
      recipe: "1. Keitä pasta.\n2. Paista pekoni.",
    })
    assert.deepEqual(draft.recipeSteps, ["Keitä pasta.", "Paista pekoni."])
  })
})

describe("normalizeDishDetections", () => {
  it("keeps recipe units and visibleInPhoto flags", () => {
    const items = normalizeDishDetections([
      {
        name: "oliiviöljy",
        confidence: 0.4,
        quantityGuess: 2,
        unit: "rkl",
        visibleInPhoto: false,
      },
      {
        name: "kirsikkatomaatti",
        confidence: 0.9,
        quantityGuess: 200,
        unit: "g",
        visibleInPhoto: true,
      },
    ])

    const oil = items.find((item) => item.originalName === "oliiviöljy")
    const tomato = items.find((item) => item.originalName === "kirsikkatomaatti")
    assert.equal(oil?.unit, "rkl")
    assert.equal(oil?.visibleInPhoto, false)
    assert.equal(tomato?.unit, "g")
    assert.equal(tomato?.visibleInPhoto, true)
  })
})
