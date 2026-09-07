import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  isUserSetExpired,
  matchMissingLocationItems,
  syncExpiredRemovalSuggestions,
} from "./pantrySuggestions"

describe("isUserSetExpired", () => {
  it("ignores default dates that the user did not set", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    assert.equal(
      isUserSetExpired({
        expirationDate: yesterday,
        expirationDateSetByUser: false,
      }),
      false
    )
    assert.equal(
      isUserSetExpired({
        expirationDate: yesterday,
        expirationDateSetByUser: true,
      }),
      true
    )
  })

  it("does not treat a future user-set date as expired", () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    assert.equal(
      isUserSetExpired({
        expirationDate: tomorrow,
        expirationDateSetByUser: true,
      }),
      false
    )
  })
})

describe("matchMissingLocationItems", () => {
  it("only returns location items Gemini marked clearly absent", () => {
    const locationItems = [
      { _id: "1", name: "Maito" },
      { _id: "2", name: "Juusto" },
      { _id: "3", name: "Kinkku" },
    ]
    const missing = matchMissingLocationItems(
      locationItems,
      [{ name: "Maito" }, { name: "Juusto" }],
      ["Kinkku", "Leipä"]
    )
    assert.deepEqual(
      missing.map((item) => item.name),
      ["Kinkku"]
    )
  })

  it("does not suggest removal when Gemini listed no absences", () => {
    const missing = matchMissingLocationItems(
      [{ _id: "1", name: "Maito" }],
      [],
      []
    )
    assert.deepEqual(missing, [])
  })

  it("never suggests an item that was detected in the photo", () => {
    const missing = matchMissingLocationItems(
      [{ _id: "1", name: "Kevyt maito" }],
      [{ name: "Kevytmaito" }],
      ["Kevyt maito"]
    )
    assert.deepEqual(missing, [])
  })
})

describe("syncExpiredRemovalSuggestions", () => {
  const pantryOf = (items: unknown[], suggestions: unknown[] = []) =>
    ({
      items,
      removalSuggestions: suggestions,
      set(field: string, value: unknown) {
        ;(this as Record<string, unknown>)[field] = value
      },
      markModified() {},
    }) as unknown as import("../models/pantry").IPantry

  it("adds a suggestion for newly expired user-set dates", () => {
    const pantry = pantryOf([
      {
        _id: "item-1",
        name: "Jogurtti",
        expirationDate: new Date("2020-01-01"),
        expirationDateSetByUser: true,
        locationId: null,
      },
    ])
    assert.equal(syncExpiredRemovalSuggestions(pantry), true)
    assert.equal(pantry.removalSuggestions.length, 1)
    assert.equal(pantry.removalSuggestions[0].reason, "expired")
    assert.equal(String(pantry.removalSuggestions[0].itemId), "item-1")
  })

  it("keeps a dismissed expired suggestion instead of recreating it", () => {
    const pantry = pantryOf(
      [
        {
          _id: "item-1",
          expirationDate: new Date("2020-01-01"),
          expirationDateSetByUser: true,
        },
      ],
      [
        {
          itemId: "item-1",
          reason: "expired",
          dismissedAt: new Date(),
        },
      ]
    )
    assert.equal(syncExpiredRemovalSuggestions(pantry), false)
    assert.equal(pantry.removalSuggestions.length, 1)
    assert.ok(pantry.removalSuggestions[0].dismissedAt)
  })
})
