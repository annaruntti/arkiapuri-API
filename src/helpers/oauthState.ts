import crypto from "crypto"
import type { CookieOptions, Request, Response } from "express"

const COOKIE_NAME = "oauth_state"
const STATE_TTL_MS = 10 * 60 * 1000
const NONCE_PATTERN = /^[0-9a-f]{32}$/

const cookieOptions = (): CookieOptions => {
  const secure =
    process.env.NODE_ENV === "production" ||
    (process.env.APP_URL || "").startsWith("https://")

  return {
    httpOnly: true,
    secure,
    // Apple posts the callback cross-site, so the cookie must be sent on that POST.
    sameSite: secure ? "none" : "lax",
    path: "/auth",
  }
}

const readCookie = (req: Request, name: string): string | null => {
  const header = req.headers.cookie
  if (!header) return null

  for (const part of header.split(";")) {
    const separator = part.indexOf("=")
    if (separator === -1) continue
    if (part.slice(0, separator).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(separator + 1).trim())
    } catch {
      return null
    }
  }

  return null
}

const digest = (value: string): Buffer =>
  crypto.createHash("sha256").update(value).digest()

/**
 * Issue an OAuth state bound to this browser and return the value sent to the provider.
 */
export const issueOAuthState = (res: Response, isMobile: boolean): string => {
  const nonce = crypto.randomBytes(16).toString("hex")
  const state = isMobile ? `mobile.${nonce}` : nonce
  res.cookie(COOKIE_NAME, state, { ...cookieOptions(), maxAge: STATE_TTL_MS })
  return state
}

/**
 * Accept the callback only when its state matches the cookie from the same browser.
 * The cookie is cleared either way so a captured state cannot be reused.
 */
export const consumeOAuthState = (
  req: Request,
  res: Response,
  returnedState: unknown
): { isMobile: boolean } | null => {
  const expected = readCookie(req, COOKIE_NAME)
  res.clearCookie(COOKIE_NAME, cookieOptions())

  if (!expected || typeof returnedState !== "string" || returnedState.length === 0) {
    return null
  }

  const matches = crypto.timingSafeEqual(digest(expected), digest(returnedState))
  if (!matches) return null

  const isMobile = expected.startsWith("mobile.")
  const nonce = isMobile ? expected.slice("mobile.".length) : expected
  if (!NONCE_PATTERN.test(nonce)) return null

  return { isMobile }
}
