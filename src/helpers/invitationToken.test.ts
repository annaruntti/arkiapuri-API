import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { parseInvitationToken } from "./invitationToken"

describe("parseInvitationToken", () => {
  it("accepts a UUID string", () => {
    const token = "550e8400-e29b-41d4-a716-446655440000"
    const result = parseInvitationToken(token)
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.token, token)
  })

  it("rejects missing token", () => {
    const result = parseInvitationToken(undefined)
    assert.equal(result.ok, false)
  })

  it("rejects NoSQL operator objects", () => {
    const result = parseInvitationToken({ $ne: null })
    assert.equal(result.ok, false)
  })

  it("rejects regex operator objects", () => {
    const result = parseInvitationToken({ $regex: "^a" })
    assert.equal(result.ok, false)
  })

  it("rejects non-UUID strings", () => {
    const result = parseInvitationToken("not-a-uuid")
    assert.equal(result.ok, false)
  })
})
