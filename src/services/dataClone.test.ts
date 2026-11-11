import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { pickFoodCatalogFields } from "./dataClone"

describe("pickFoodCatalogFields", () => {
  it("copies catalog fields without quantities or owner", () => {
    const picked = pickFoodCatalogFields({
      name: "Maito",
      isFood: true,
      category: ["dairy"],
      unit: "l",
      packageQuantity: 1,
      price: 1.2,
      priceSource: "user",
      calories: 40,
      nutrition: { proteins: 3 },
      image: { url: "https://x", publicId: "p" },
      openFoodFactsData: { barcode: "123" },
      user: "should-not-appear" as never,
      quantities: { meal: 5, "shopping-list": 1, pantry: 2 },
    } as never)

    assert.equal(picked.name, "Maito")
    assert.deepEqual(picked.category, ["dairy"])
    assert.equal((picked as { user?: unknown }).user, undefined)
    assert.equal((picked as { quantities?: unknown }).quantities, undefined)
  })
})
