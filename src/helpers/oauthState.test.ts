import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { Request, Response } from "express"
import { consumeOAuthState, issueOAuthState } from "./oauthState"

const mockResponse = () => {
  const jar = new Map<string, string>()
  const res = {
    cookie(name: string, value: string) {
      jar.set(name, value)
    },
    clearCookie(name: string) {
      jar.delete(name)
    },
  }
  return { res: res as unknown as Response, jar }
}

const requestWith = (cookie: string | undefined): Request =>
  ({ headers: cookie ? { cookie } : {} }) as Request

describe("oauth state", () => {
  it("accepts the state that was issued to the same browser", () => {
    const { res, jar } = mockResponse()
    const state = issueOAuthState(res, false)
    const issued = jar.get("oauth_state")

    const result = consumeOAuthState(
      requestWith(`oauth_state=${issued}`),
      res,
      state
    )

    assert.deepEqual(result, { isMobile: false })
    assert.equal(jar.has("oauth_state"), false)
  })

  it("returns the PKCE verifier issued with the state", () => {
    const { res, jar } = mockResponse()
    const verifier = "a".repeat(43)
    const state = issueOAuthState(res, false, { pkceVerifier: verifier })

    const result = consumeOAuthState(
      requestWith(
        `oauth_state=${jar.get("oauth_state")}; oauth_pkce=${verifier}`
      ),
      res,
      state
    )

    assert.deepEqual(result, { isMobile: false, pkceVerifier: verifier })
    assert.equal(jar.has("oauth_pkce"), false)
  })

  it("keeps the mobile flag inside the verified state", () => {
    const { res, jar } = mockResponse()
    const state = issueOAuthState(res, true)

    const result = consumeOAuthState(
      requestWith(`oauth_state=${jar.get("oauth_state")}`),
      res,
      state
    )

    assert.deepEqual(result, { isMobile: true })
  })

  it("rejects a callback whose state was not issued to this browser", () => {
    const { res, jar } = mockResponse()
    issueOAuthState(res, false)
    const { res: otherRes, jar: otherJar } = mockResponse()
    const attackerState = issueOAuthState(otherRes, false)

    const result = consumeOAuthState(
      requestWith(`oauth_state=${jar.get("oauth_state")}`),
      res,
      attackerState
    )

    assert.equal(result, null)
    assert.equal(otherJar.get("oauth_state"), attackerState)
  })

  it("rejects a callback with no state cookie", () => {
    const { res } = mockResponse()
    const result = consumeOAuthState(requestWith(undefined), res, "a".repeat(32))
    assert.equal(result, null)
  })
})
