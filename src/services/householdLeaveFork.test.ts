import { describe, it } from "node:test"
import assert from "node:assert/strict"
import mongoose from "mongoose"

/**
 * Pure remap helper mirroring leave-fork meal ingredient remapping.
 * Full DB fork is covered manually; this guards the id-map contract.
 */
const remapFoodIds = (
  rows: Array<{ foodId: mongoose.Types.ObjectId; quantity: number; unit: string }>,
  map: Map<string, mongoose.Types.ObjectId>
) =>
  rows.map((row) => {
    const mapped = map.get(String(row.foodId))
    return mapped
      ? { foodId: mapped, quantity: row.quantity, unit: row.unit }
      : row
  })

describe("household leave fork foodId remap", () => {
  it("rewrites ingredient ids using the fork map and leaves household originals untouched", () => {
    const originalId = new mongoose.Types.ObjectId()
    const forkedId = new mongoose.Types.ObjectId()
    const map = new Map([[String(originalId), forkedId]])
    const sourceRows = [
      { foodId: originalId, quantity: 2, unit: "dl" },
    ]
    const remapped = remapFoodIds(sourceRows, map)

    assert.equal(String(remapped[0].foodId), String(forkedId))
    assert.equal(String(sourceRows[0].foodId), String(originalId))
    assert.equal(remapped[0].quantity, 2)
  })
})
