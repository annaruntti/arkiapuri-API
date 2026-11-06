import { OAuth2Client } from "google-auth-library"

const client = new OAuth2Client()

export type GoogleIdTokenPayload = {
  email?: string
  email_verified?: boolean | string
  name?: string
  picture?: string
  sub: string
}

/**
 * Verify a Google ID token against configured client IDs (audience).
 */
export const verifyGoogleIdToken = async (
  idToken: string
): Promise<GoogleIdTokenPayload> => {
  const audiences = [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
  ].filter(Boolean) as string[]

  if (audiences.length === 0) {
    throw new Error("Google OAuth client ID not configured")
  }

  const ticket = await client.verifyIdToken({
    idToken,
    audience: audiences.length === 1 ? audiences[0] : audiences,
  })
  const payload = ticket.getPayload()
  if (!payload?.sub) {
    throw new Error("Invalid Google ID token")
  }
  return payload as GoogleIdTokenPayload
}
