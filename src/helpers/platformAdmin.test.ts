import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import {
  getPlatformAdminEmails,
  isPlatformAdminEmail,
  resolvePlatformRole,
} from "./platformAdmin"

describe("platformAdmin allowlist", () => {
  const previous = process.env.PLATFORM_ADMIN_EMAILS

  beforeEach(() => {
    process.env.PLATFORM_ADMIN_EMAILS = "Admin@Example.com, other@test.fi "
  })

  afterEach(() => {
    if (previous === undefined) delete process.env.PLATFORM_ADMIN_EMAILS
    else process.env.PLATFORM_ADMIN_EMAILS = previous
  })

  it("parses trimmed case-insensitive emails", () => {
    const set = getPlatformAdminEmails()
    assert.equal(set.has("admin@example.com"), true)
    assert.equal(set.has("other@test.fi"), true)
    assert.equal(set.size, 2)
  })

  it("resolves admin vs user", () => {
    assert.equal(isPlatformAdminEmail("ADMIN@example.com"), true)
    assert.equal(resolvePlatformRole("nobody@example.com"), "user")
    assert.equal(resolvePlatformRole("admin@example.com"), "admin")
  })
})
