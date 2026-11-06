import express, { Router, Request, Response } from "express"
import crypto from "crypto"
import User from "../models/user"
import { sendPasswordResetEmail } from "../services/emailService"
import { SOCIAL_TOKEN_TTL, signUserToken } from "../helpers/authToken"
import { authRateLimiter } from "../middleware/security"
import {
  getPasswordLengthError,
  hashResetToken,
} from "../helpers/passwordPolicy"
import { buildOAuthRedirectUrl } from "../helpers/oauthRedirect"
import { consumeOAuthState, issueOAuthState } from "../helpers/oauthState"
import { createPkcePair } from "../helpers/pkce"
import { isSocialIdTokenProvider } from "../helpers/socialProviders"
import {
  createAuthCodeForUser,
  exchangeAuthCode,
} from "../services/authCode"
import { linkOrCreateSocialUser } from "../services/socialAccountLink"
import { verifyGoogleIdToken } from "../services/googleIdToken"
import {
  issueEmailVerification,
  verifyEmailWithToken,
} from "../services/emailVerify"
import type { IUser } from "../models/user"

const router = Router()

const completeOAuthRedirect = async (
  res: Response,
  user: IUser,
  provider: string,
  isMobile: boolean
) => {
  const code = await createAuthCodeForUser(user, provider)
  const redirectUrl = buildOAuthRedirectUrl(isMobile, {
    provider,
    code,
  })
  return res.redirect(redirectUrl)
}

const redirectOAuthError = (
  res: Response,
  provider: string,
  isMobile: boolean,
  message: string
) => {
  const redirectUrl = buildOAuthRedirectUrl(isMobile, {
    provider,
    error: message,
  })
  return res.redirect(redirectUrl)
}

// Google OAuth
router.get("/google", (req: Request, res: Response) => {
  const googleAuthUrl = "https://accounts.google.com/o/oauth2/v2/auth"
  const clientId = process.env.GOOGLE_CLIENT_ID as string
  const isMobile = req.query.platform === "mobile"
  const redirectUri = `${process.env.APP_URL}/auth/google/callback`
  const { verifier, challenge } = createPkcePair()
  const state = issueOAuthState(res, isMobile, { pkceVerifier: verifier })

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  })

  res.redirect(`${googleAuthUrl}?${params}`)
})

// Google OAuth callback
router.get("/google/callback", async (req: Request, res: Response) => {
  const { code, state } = req.query as Record<string, string>
  const oauthState = consumeOAuthState(req, res, state)
  if (!oauthState) {
    return redirectOAuthError(res, "google", false, "Invalid state")
  }
  const isMobileRequest = oauthState.isMobile
  if (!oauthState.pkceVerifier) {
    return redirectOAuthError(res, "google", isMobileRequest, "Missing PKCE verifier")
  }

  try {

    const tokenParams = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID as string,
      client_secret: process.env.GOOGLE_CLIENT_SECRET as string,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${process.env.APP_URL}/auth/google/callback`,
      code_verifier: oauthState.pkceVerifier,
    })

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams,
    })

    const tokenData: any = await tokenResponse.json()

    if (tokenData.error) {
      console.error("Token exchange error:", tokenData)
      return redirectOAuthError(
        res,
        "google",
        isMobileRequest,
        tokenData.error_description || "Token exchange failed"
      )
    }

    let email: string | undefined
    let emailVerified = false
    let name: string | undefined
    let picture: string | undefined
    let sub: string | undefined

    if (tokenData.id_token) {
      const payload = await verifyGoogleIdToken(tokenData.id_token)
      email = payload.email
      emailVerified =
        payload.email_verified === true || payload.email_verified === "true"
      name = payload.name
      picture = payload.picture
      sub = payload.sub
    } else {
      return redirectOAuthError(
        res,
        "google",
        isMobileRequest,
        "Google ID token missing"
      )
    }

    if (!sub) {
      return redirectOAuthError(res, "google", isMobileRequest, "Invalid Google user")
    }

    const linked = await linkOrCreateSocialUser({
      email,
      emailVerified,
      name,
      picture,
      providerId: sub,
      provider: "google",
    })

    if (linked.status !== "ok") {
      return redirectOAuthError(res, "google", isMobileRequest, linked.message)
    }

    return completeOAuthRedirect(res, linked.user, "google", isMobileRequest)
  } catch (error) {
    console.error("Google auth error:", error)
    return redirectOAuthError(
      res,
      "google",
      isMobileRequest,
      "Kirjautuminen epäonnistui"
    )
  }
})

// Apple OAuth
router.get("/apple", (req: Request, res: Response) => {
  const appleAuthUrl = "https://appleid.apple.com/auth/authorize"
  const clientId = (process.env.APPLE_CLIENT_ID ||
    process.env.APPLE_SERVICE_ID) as string
  const isMobile = req.query.platform === "mobile"
  const redirectUri = `${process.env.APP_URL}/auth/apple/callback`
  const state = issueOAuthState(res, isMobile)

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "name email",
    response_mode: "form_post",
    state,
  })

  res.redirect(`${appleAuthUrl}?${params}`)
})

// Apple OAuth callback
router.post(
  "/apple/callback",
  express.urlencoded({ extended: false, limit: "16kb" }),
  async (req: Request, res: Response) => {
  const oauthState = consumeOAuthState(req, res, req.body?.state)
  if (!oauthState) {
    return redirectOAuthError(res, "apple", false, "Invalid state")
  }
  const isMobileRequest = oauthState.isMobile

  try {
    const { code, user } = req.body

    const tokenParams = new URLSearchParams({
      client_id: (process.env.APPLE_CLIENT_ID ||
        process.env.APPLE_SERVICE_ID) as string,
      client_secret: process.env.APPLE_CLIENT_SECRET as string,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${process.env.APP_URL}/auth/apple/callback`,
    })

    const tokenResponse = await fetch("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams,
    })

    const tokenData: any = await tokenResponse.json()

    if (tokenData.error) {
      return redirectOAuthError(
        res,
        "apple",
        isMobileRequest,
        tokenData.error_description || "Token exchange failed"
      )
    }

    const { id_token } = tokenData
    const base64Payload = id_token.split(".")[1]
    const payload = Buffer.from(base64Payload, "base64").toString()
    const appleUser = JSON.parse(payload)

    let userName: string | null = null
    if (user) {
      try {
        const userData = typeof user === "string" ? JSON.parse(user) : user
        if (userData.name) {
          userName =
            `${userData.name.firstName || ""} ${userData.name.lastName || ""}`.trim()
        }
      } catch (e) {
        console.error("Error parsing user data:", e)
      }
    }

    const linked = await linkOrCreateSocialUser({
      email: appleUser.email,
      // Apple only returns email when verified for the user.
      emailVerified: Boolean(appleUser.email),
      name: userName,
      providerId: appleUser.sub,
      provider: "apple",
    })

    if (linked.status !== "ok") {
      return redirectOAuthError(res, "apple", isMobileRequest, linked.message)
    }

    return completeOAuthRedirect(res, linked.user, "apple", isMobileRequest)
  } catch (error) {
    console.error("Apple auth error:", error)
    return redirectOAuthError(res, "apple", isMobileRequest, "Kirjautuminen epäonnistui")
  }
})

// Facebook OAuth
router.get("/facebook", (req: Request, res: Response) => {
  const facebookAuthUrl = "https://www.facebook.com/v18.0/dialog/oauth"
  const clientId = process.env.FACEBOOK_APP_ID as string
  const redirectUri = `${process.env.APP_URL}/auth/facebook/callback`
  const isMobile = req.query.platform === "mobile"
  const state = issueOAuthState(res, isMobile)

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "public_profile,email",
    state,
  })

  res.redirect(`${facebookAuthUrl}?${params}`)
})

// Facebook OAuth callback
router.get("/facebook/callback", async (req: Request, res: Response) => {
  const { code, error, state } = req.query as Record<string, string>
  const oauthState = consumeOAuthState(req, res, state)
  if (!oauthState) {
    return redirectOAuthError(res, "facebook", false, "Invalid state")
  }
  const isMobileRequest = oauthState.isMobile

  try {
    if (error) {
      return redirectOAuthError(res, "facebook", isMobileRequest, error)
    }

    const tokenParams = new URLSearchParams({
      client_id: process.env.FACEBOOK_APP_ID as string,
      client_secret: process.env.FACEBOOK_APP_SECRET as string,
      code,
      redirect_uri: `${process.env.APP_URL}/auth/facebook/callback`,
    })

    const tokenResponse = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?${tokenParams}`,
      { method: "GET" }
    )
    const tokenData: any = await tokenResponse.json()

    if (tokenData.error) {
      return redirectOAuthError(
        res,
        "facebook",
        isMobileRequest,
        tokenData.error.message || "Token exchange failed"
      )
    }

    const { access_token } = tokenData
    const userResponse = await fetch(
      `https://graph.facebook.com/v18.0/me?fields=id,name,email,picture&access_token=${access_token}`
    )
    const facebookUser: any = await userResponse.json()

    const linked = await linkOrCreateSocialUser({
      email: facebookUser.email || null,
      emailVerified: Boolean(facebookUser.email),
      name: facebookUser.name,
      picture: facebookUser.picture?.data?.url,
      providerId: facebookUser.id,
      provider: "facebook",
    })

    if (linked.status !== "ok") {
      return redirectOAuthError(
        res,
        "facebook",
        isMobileRequest,
        linked.message
      )
    }

    return completeOAuthRedirect(
      res,
      linked.user,
      "facebook",
      isMobileRequest
    )
  } catch (error) {
    console.error("Facebook auth error:", error)
    return redirectOAuthError(
      res,
      "facebook",
      isMobileRequest,
      "Kirjautuminen epäonnistui"
    )
  }
})

/**
 * Exchange one-time OAuth auth code for a session JWT.
 * Never put the JWT in the redirect URL.
 */
router.post("/exchange", authRateLimiter, async (req: Request, res: Response) => {
  try {
    const result = await exchangeAuthCode(req.body?.code)
    if (result.status !== "ok") {
      return res.status(400).json({ success: false, message: result.message })
    }
    res.json({
      success: true,
      token: result.token,
      user: result.user,
    })
  } catch (error) {
    console.error("Auth code exchange error:", error)
    res.status(500).json({ success: false, message: "Kirjautuminen epäonnistui" })
  }
})

/**
 * Mobile social auth with a verified Google ID token (no demo provider).
 */
router.post("/social", authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { provider, token, idToken } = req.body
    const googleToken = idToken || token

    if (!isSocialIdTokenProvider(provider)) {
      return res
        .status(400)
        .json({ success: false, message: "Tuntematon palveluntarjoaja" })
    }
    if (!googleToken || typeof googleToken !== "string") {
      return res.status(400).json({ success: false, message: "Token vaaditaan" })
    }

    const payload = await verifyGoogleIdToken(googleToken)
    const linked = await linkOrCreateSocialUser({
      email: payload.email,
      emailVerified:
        payload.email_verified === true || payload.email_verified === "true",
      name: payload.name,
      picture: payload.picture,
      providerId: payload.sub,
      provider: "google",
    })

    if (linked.status !== "ok") {
      return res.status(409).json({ success: false, message: linked.message })
    }

    const jwtToken = signUserToken(linked.user, SOCIAL_TOKEN_TTL)
    res.json({
      success: true,
      token: jwtToken,
      user: {
        _id: linked.user._id,
        email: linked.user.email,
        name: linked.user.name,
        profilePicture: linked.user.profilePicture,
      },
    })
  } catch (error) {
    console.error("Social auth error:", error)
    res
      .status(500)
      .json({ success: false, message: "Sosiaalinen kirjautuminen epäonnistui" })
  }
})

router.post(
  "/verify-email",
  authRateLimiter,
  async (req: Request, res: Response) => {
    try {
      const result = await verifyEmailWithToken(req.body?.token)
      if (result.status !== "ok") {
        return res.status(400).json({ success: false, message: result.message })
      }
      res.json({ success: true, message: result.message })
    } catch (error) {
      console.error("Verify email error:", error)
      res.status(500).json({ success: false, message: "Palvelinvirhe" })
    }
  }
)

router.post(
  "/resend-verification",
  authRateLimiter,
  async (req: Request, res: Response) => {
    try {
      const email = String(req.body?.email || "")
        .toLowerCase()
        .trim()
      if (!email) {
        return res
          .status(400)
          .json({ success: false, message: "Sähköposti vaaditaan" })
      }
      const user = await User.findOne({ email })
      // Generic response to avoid enumeration
      const generic = {
        success: true,
        message:
          "Jos tili löytyy ja on vahvistamatta, lähetämme vahvistusviestin.",
      }
      if (!user || user.isEmailVerified) {
        return res.json(generic)
      }
      await issueEmailVerification(user)
      res.json(generic)
    } catch (error) {
      console.error("Resend verification error:", error)
      res.status(500).json({ success: false, message: "Palvelinvirhe" })
    }
  }
)

// Forgot Password
router.post("/forgot-password", authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ success: false, message: "Sähköpostiosoite on pakollinen" })
    }

    const user = await User.findOne({ email: email.toLowerCase() })

    const genericSuccessMessage =
      "Jos sähköpostiosoite löytyy järjestelmästä, lähetämme ohjeet salasanan vaihtamiseen."

    if (!user) {
      return res.status(200).json({
        success: true,
        message: genericSuccessMessage,
      })
    }

    const resetToken = crypto.randomBytes(32).toString("hex")
    const resetTokenExpiry = new Date(Date.now() + 3600000)

    user.resetPasswordToken = hashResetToken(resetToken)
    user.resetPasswordExpiry = resetTokenExpiry
    await user.save()

    const appUrl = process.env.WEB_URL || process.env.APP_URL || "http://localhost:8081"
    const resetUrl = `${appUrl.replace(/\/$/, "")}/reset-password?token=${resetToken}`

    const emailResult = await sendPasswordResetEmail({
      to: user.email,
      name: user.username || user.name,
      resetUrl,
    })

    if (!emailResult.success) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[dev] Password reset email was not sent. Use this link to reset:",
          emailResult.previewUrl || resetUrl
        )
        return res.status(503).json({
          success: false,
          emailSent: false,
          message:
            "Sähköpostia ei voitu lähettää (SMTP-virhe). Tarkista EMAIL_USER ja EMAIL_PASSWORD. Kehitystilassa reset-linkki on palvelimen lokissa.",
          previewUrl: emailResult.previewUrl || resetUrl,
          error: emailResult.error || emailResult.message,
        })
      }

      return res.status(500).json({
        success: false,
        emailSent: false,
        message:
          "Sähköpostin lähettäminen epäonnistui. Yritä myöhemmin uudelleen.",
      })
    }

    res.status(200).json({
      success: true,
      emailSent: true,
      message: "Ohjeet salasanan vaihtamiseen on lähetetty sähköpostiisi.",
    })
  } catch (error) {
    console.error("Forgot password error:", error)
    res.status(500).json({ success: false, message: "Palvelinvirhe. Yritä myöhemmin uudelleen." })
  }
})

// Reset Password
router.post("/reset-password", authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: "Token ja uusi salasana ovat pakollisia" })
    }

    const passwordError = getPasswordLengthError(newPassword)
    if (passwordError) {
      return res.status(400).json({ success: false, message: passwordError })
    }

    const user = await User.findOne({
      resetPasswordToken: hashResetToken(token),
      resetPasswordExpiry: { $gt: new Date() },
    })

    if (!user) {
      return res.status(400).json({ success: false, message: "Virheellinen tai vanhentunut token" })
    }

    user.password = newPassword
    user.resetPasswordToken = undefined
    user.resetPasswordExpiry = undefined
    user.tokenVersion = (Number(user.tokenVersion) || 0) + 1
    await user.save()

    res.status(200).json({ success: true, message: "Salasana vaihdettu onnistuneesti" })
  } catch (error) {
    console.error("Reset password error:", error)
    res.status(500).json({ success: false, message: "Palvelinvirhe. Yritä myöhemmin uudelleen." })
  }
})

export default router
