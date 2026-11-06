import { describe, it } from "node:test"
import assert from "node:assert/strict"
import mongoose from "mongoose"
import { scopedFoodItemIdsFilter } from "./foodItemAccess"

describe("scopedFoodItemIdsFilter", () => {
  it("always constrains by owner ids so foreign foodIds cannot pass alone", () => {
    const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()]
    const owners = [new mongoose.Types.ObjectId()]
    const filter = scopedFoodItemIdsFilter(ids, owners)

    assert.deepEqual(filter._id, { $in: ids })
    assert.ok(filter.user)
    assert.notEqual(filter.user, undefined)
    // Cross-tenant write would need an id match WITHOUT user scope — that key must exist.
    assert.equal(Object.prototype.hasOwnProperty.call(filter, "user"), true)
  })

  it("scopes to a single user when there is no household member list", () => {
    const ids = [new mongoose.Types.ObjectId()]
    const userId = new mongoose.Types.ObjectId()
    const filter = scopedFoodItemIdsFilter(ids, [], userId)
    assert.deepEqual(filter, { _id: { $in: ids }, user: userId })
  })
})