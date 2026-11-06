import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { isSocialIdTokenProvider } from "./socialProviders"

describe("social id-token providers", () => {
  it("rejects demo and unknown providers", () => {
    assert.equal(isSocialIdTokenProvider("demo"), false)
    assert.equal(isSocialIdTokenProvider("facebook"), false)
    assert.equal(isSocialIdTokenProvider({ $ne: null }), false)
  })

  it("allows google", () => {
    assert.equal(isSocialIdTokenProvider("google"), true)
  })
})
