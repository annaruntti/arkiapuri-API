import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { applyPantryItemExpirationDate } from "./pantryHelpers"

describe("applyPantryItemExpirationDate", () => {
  it("clears the stored date when the client sends null", () => {
    const item = {
      expirationDate: new Date("2020-01-01"),
      expirationDateSetByUser: true,
    }

    applyPantryItemExpirationDate(item, null)

    assert.equal(item.expirationDate, null)
    assert.equal(item.expirationDateSetByUser, false)
  })

  it("clears the stored date when the client sends an empty string", () => {
    const item = {
      expirationDate: new Date("2020-01-01"),
      expirationDateSetByUser: true,
    }

    applyPantryItemExpirationDate(item, "")

    assert.equal(item.expirationDate, null)
    assert.equal(item.expirationDateSetByUser, false)
  })

  it("uses set() so Mongoose persists the cleared date", () => {
    const calls: Array<[string, unknown]> = []
    const item = {
      expirationDate: new Date("2020-01-01") as Date | null,
      expirationDateSetByUser: true,
      set(path: string, value: unknown) {
        calls.push([path, value])
        this.expirationDate = value as Date | null
      },
    }

    applyPantryItemExpirationDate(item, null)

    assert.deepEqual(calls, [["expirationDate", null]])
    assert.equal(item.expirationDate, null)
    assert.equal(item.expirationDateSetByUser, false)
  })

  it("stores a user-set date", () => {
    const item = {
      expirationDate: null as Date | null,
      expirationDateSetByUser: false,
    }

    applyPantryItemExpirationDate(item, "2026-09-10")

    assert.equal(item.expirationDateSetByUser, true)
    assert.equal(item.expirationDate?.toISOString().slice(0, 10), "2026-09-10")
  })
})
