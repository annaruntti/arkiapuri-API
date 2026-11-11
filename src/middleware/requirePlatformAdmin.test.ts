import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { Request, Response } from "express"
import { requirePlatformAdmin } from "./requirePlatformAdmin"

const mockRes = () => {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
  }
  return res as unknown as Response & { statusCode: number; body: unknown }
}

describe("requirePlatformAdmin", () => {
  it("returns 403 for non-admin users", () => {
    const req = { user: { platformRole: "user" } } as Request
    const res = mockRes()
    let nextCalled = false
    requirePlatformAdmin(req, res, () => {
      nextCalled = true
    })
    assert.equal(res.statusCode, 403)
    assert.equal(nextCalled, false)
  })

  it("calls next for platform admins", () => {
    const req = { user: { platformRole: "admin" } } as Request
    const res = mockRes()
    let nextCalled = false
    requirePlatformAdmin(req, res, () => {
      nextCalled = true
    })
    assert.equal(nextCalled, true)
    assert.equal(res.statusCode, 200)
  })
})
