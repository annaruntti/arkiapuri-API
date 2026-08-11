import { Router, Request, Response } from "express"
import jwt from "jsonwebtoken"
import crypto from "crypto"
import User from "../models/user"
import { sendPasswordResetEmail } from "../services/emailService"

const router = Router()

// Google OAuth
router.get("/google", (req: Request, res: Response) => {
  const googleAuthUrl = "https://accounts.google.com/o/oauth2/v2/auth"
  const clientId = process.env.GOOGLE_CLIENT_ID as string
  const isMobile = req.query.platform === "mobile"
  const redirectUri = `${process.env.APP_URL}/auth/google/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
  })

  if (isMobile) {
    params.set("state", "mobile")
  }

  res.redirect(`${googleAuthUrl}?${params}`)
})

// Google OAuth callback
router.get("/google/callback", async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query as Record<string, string>
    const isMobileRequest = state === "mobile"

    const tokenParams = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID as string,
      client_secret: process.env.GOOGLE_CLIENT_SECRET as string,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${process.env.APP_URL}/auth/google/callback`,
    })

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams,
    })

    const tokenData: any = await tokenResponse.json()

    if (tokenData.error) {
      console.error("Token exchange error:", tokenData)
      const errorUrl = isMobileRequest
        ? `arkiapuri://auth/callback?provider=google&error=${encodeURIComponent(tokenData.error_description || "Token exchange failed")}`
        : `http://localhost:8081/AuthCallback?provider=google&error=${encodeURIComponent(tokenData.error_description || "Token exchange failed")}`
      return res.redirect(errorUrl)
    }

    const { access_token } = tokenData

    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    })

    const googleUser: any = await userResponse.json()

    let user = await User.findOne({ email: googleUser.email })

    if (!user) {
      user = new User({
        email: googleUser.email,
        name: googleUser.name,
        profilePicture: googleUser.picture,
        googleId: googleUser.id,
        isEmailVerified: true,
      })
      await user.save()
    } else {
      user.googleId = googleUser.id
      user.profilePicture = googleUser.picture
      user.isEmailVerified = true
      await user.save()
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: "30d" }
    )

    const redirectUrl = isMobileRequest
      ? `arkiapuri://auth/callback?provider=google&token=${token}&user=${encodeURIComponent(JSON.stringify({ _id: user._id, email: user.email, name: user.name, profilePicture: user.profilePicture }))}`
      : `http://localhost:8081/AuthCallback?provider=google&token=${token}&user=${encodeURIComponent(JSON.stringify({ _id: user._id, email: user.email, name: user.name, profilePicture: user.profilePicture }))}`

    res.redirect(redirectUrl)
  } catch (error) {
    console.error("Google auth error:", error)
    res.redirect(`exp://127.0.0.1:8081/--/auth/callback?error=${encodeURIComponent("Kirjautuminen epäonnistui")}`)
  }
})

// Apple OAuth
router.get("/apple", (req: Request, res: Response) => {
  const appleAuthUrl = "https://appleid.apple.com/auth/authorize"
  const clientId = (process.env.APPLE_CLIENT_ID || process.env.APPLE_SERVICE_ID) as string
  const redirectUri = `${process.env.APP_URL}/auth/apple/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "name email",
    response_mode: "form_post",
  })

  res.redirect(`${appleAuthUrl}?${params}`)
})

// Apple OAuth callback
router.post("/apple/callback", async (req: Request, res: Response) => {
  try {
    const { code, user } = req.body

    const tokenParams = new URLSearchParams({
      client_id: (process.env.APPLE_CLIENT_ID || process.env.APPLE_SERVICE_ID) as string,
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
      return res.redirect(
        `http://localhost:8081/AuthCallback?provider=apple&error=${encodeURIComponent(tokenData.error_description || "Token exchange failed")}`
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
          userName = `${userData.name.firstName || ""} ${userData.name.lastName || ""}`.trim()
        }
      } catch (e) {
        console.error("Error parsing user data:", e)
      }
    }

    let dbUser = await User.findOne({ email: appleUser.email })

    if (!dbUser) {
      dbUser = new User({
        email: appleUser.email,
        name: userName || appleUser.email.split("@")[0],
        appleId: appleUser.sub,
        isEmailVerified: true,
      })
      await dbUser.save()
    } else {
      dbUser.appleId = appleUser.sub
      if (userName && !dbUser.name) dbUser.name = userName
      dbUser.isEmailVerified = true
      await dbUser.save()
    }

    const token = jwt.sign(
      { userId: dbUser._id, email: dbUser.email },
      process.env.JWT_SECRET as string,
      { expiresIn: "30d" }
    )

    const redirectUrl = `http://localhost:8081/AuthCallback?provider=apple&token=${token}&user=${encodeURIComponent(JSON.stringify({ _id: dbUser._id, email: dbUser.email, name: dbUser.name, profilePicture: dbUser.profilePicture }))}`
    res.redirect(redirectUrl)
  } catch (error) {
    console.error("Apple auth error:", error)
    res.redirect(`http://localhost:8081/AuthCallback?provider=apple&error=${encodeURIComponent("Kirjautuminen epäonnistui")}`)
  }
})

// Facebook OAuth
router.get("/facebook", (req: Request, res: Response) => {
  const facebookAuthUrl = "https://www.facebook.com/v18.0/dialog/oauth"
  const clientId = process.env.FACEBOOK_APP_ID as string
  const redirectUri = `${process.env.APP_URL}/auth/facebook/callback`
  const isMobile = req.query.platform === "mobile"

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "public_profile",
    state: isMobile ? "mobile" : crypto.randomBytes(16).toString("hex"),
  })

  res.redirect(`${facebookAuthUrl}?${params}`)
})

// Facebook OAuth callback
router.get("/facebook/callback", async (req: Request, res: Response) => {
  try {
    const { code, error, state } = req.query as Record<string, string>
    const isMobileRequest = state === "mobile"

    if (error) {
      const errorUrl = isMobileRequest
        ? `arkiapuri://auth/callback?provider=facebook&error=${encodeURIComponent(error)}`
        : `http://localhost:8081/AuthCallback?provider=facebook&error=${encodeURIComponent(error)}`
      return res.redirect(errorUrl)
    }

    const tokenParams = new URLSearchParams({
      client_id: process.env.FACEBOOK_APP_ID as string,
      client_secret: process.env.FACEBOOK_APP_SECRET as string,
      code,
      redirect_uri: `${process.env.APP_URL}/auth/facebook/callback`,
    })

    const tokenResponse = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?${tokenParams}`, { method: "GET" })
    const tokenData: any = await tokenResponse.json()

    if (tokenData.error) {
      const errorUrl = isMobileRequest
        ? `arkiapuri://auth/callback?provider=facebook&error=${encodeURIComponent(tokenData.error.message || "Token exchange failed")}`
        : `http://localhost:8081/AuthCallback?provider=facebook&error=${encodeURIComponent(tokenData.error.message || "Token exchange failed")}`
      return res.redirect(errorUrl)
    }

    const { access_token } = tokenData
    const userResponse = await fetch(`https://graph.facebook.com/v18.0/me?fields=id,name,email,picture&access_token=${access_token}`)
    const facebookUser: any = await userResponse.json()

    const userEmail = facebookUser.email || `${facebookUser.id}@facebook.user`

    let dbUser = await User.findOne({ $or: [{ email: userEmail }, { facebookId: facebookUser.id }] })

    if (!dbUser) {
      dbUser = new User({
        email: userEmail,
        name: facebookUser.name,
        profilePicture: facebookUser.picture?.data?.url,
        facebookId: facebookUser.id,
        isEmailVerified: !!facebookUser.email,
      })
      await dbUser.save()
    } else {
      dbUser.facebookId = facebookUser.id
      if (facebookUser.email && dbUser.email.includes("@facebook.user")) {
        dbUser.email = facebookUser.email
        dbUser.isEmailVerified = true
      }
      if (facebookUser.picture?.data?.url) dbUser.profilePicture = facebookUser.picture.data.url
      await dbUser.save()
    }

    const token = jwt.sign(
      { userId: dbUser._id, email: dbUser.email },
      process.env.JWT_SECRET as string,
      { expiresIn: "30d" }
    )

    const redirectUrl = isMobileRequest
      ? `arkiapuri://auth/callback?provider=facebook&token=${token}&user=${encodeURIComponent(JSON.stringify({ _id: dbUser._id, email: dbUser.email, name: dbUser.name, profilePicture: dbUser.profilePicture }))}`
      : `http://localhost:8081/AuthCallback?provider=facebook&token=${token}&user=${encodeURIComponent(JSON.stringify({ _id: dbUser._id, email: dbUser.email, name: dbUser.name, profilePicture: dbUser.profilePicture }))}`

    res.redirect(redirectUrl)
  } catch (error) {
    console.error("Facebook auth error:", error)
    res.redirect(`http://localhost:8081/AuthCallback?provider=facebook&error=${encodeURIComponent("Kirjautuminen epäonnistui")}`)
  }
})

// Social auth endpoint for mobile app
router.post("/social", async (req: Request, res: Response) => {
  try {
    const { provider, token } = req.body

    let googleUser: any

    if (provider === "google") {
      const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
      })
      googleUser = await userResponse.json()
    } else if (provider === "demo") {
      googleUser = {
        email: "demo@gmail.com",
        name: "Demo User",
        picture: "https://via.placeholder.com/150",
        id: "demo123",
      }
    } else {
      return res.status(400).json({ success: false, message: "Tuntematon palveluntarjoaja" })
    }

    let user = await User.findOne({ email: googleUser.email })

    if (!user) {
      user = new User({
        email: googleUser.email,
        name: googleUser.name,
        profilePicture: googleUser.picture,
        googleId: googleUser.id,
        isEmailVerified: true,
      })
      await user.save()
    }

    const jwtToken = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: "30d" }
    )

    res.json({
      success: true,
      token: jwtToken,
      user: { _id: user._id, email: user.email, name: user.name, profilePicture: user.profilePicture },
    })
  } catch (error) {
    console.error("Social auth error:", error)
    res.status(500).json({ success: false, message: "Sosiaalinen kirjautuminen epäonnistui" })
  }
})

// Forgot Password
router.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ success: false, message: "Sähköpostiosoite on pakollinen" })
    }

    const user = await User.findOne({ email: email.toLowerCase() })

    // Always return a generic success message to avoid email enumeration
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

    user.resetPasswordToken = resetToken
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
      // Token is saved; in development expose reset link for local testing
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
router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: "Token ja uusi salasana ovat pakollisia" })
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "Salasanan pituuden tulee olla vähintään 6 merkkiä" })
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpiry: { $gt: new Date() },
    })

    if (!user) {
      return res.status(400).json({ success: false, message: "Virheellinen tai vanhentunut token" })
    }

    user.password = newPassword
    user.resetPasswordToken = undefined
    user.resetPasswordExpiry = undefined
    await user.save()

    res.status(200).json({ success: true, message: "Salasana vaihdettu onnistuneesti" })
  } catch (error) {
    console.error("Reset password error:", error)
    res.status(500).json({ success: false, message: "Palvelinvirhe. Yritä myöhemmin uudelleen." })
  }
})

export default router
