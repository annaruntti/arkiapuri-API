const express = require("express")
const jwt = require("jsonwebtoken")
const crypto = require("crypto")
const nodemailer = require("nodemailer")
const User = require("../models/user")
const router = express.Router()

// Google OAuth
router.get("/google", (req, res) => {
  const googleAuthUrl = "https://accounts.google.com/o/oauth2/v2/auth"
  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = `${process.env.APP_URL}/auth/google/callback`

  console.log("=== Google OAuth Debug ===")
  console.log("APP_URL:", process.env.APP_URL)
  console.log("GOOGLE_CLIENT_ID:", clientId)
  console.log("Redirect URI being sent to Google:", redirectUri)
  console.log("========================")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
  })

  res.redirect(`${googleAuthUrl}?${params}`)
})

// Google OAuth callback
router.get("/google/callback", async (req, res) => {
  try {
    const { code } = req.query

    console.log("=== Google OAuth Callback Debug ===")
    console.log("Received code:", code ? "YES" : "NO")
    console.log("APP_URL:", process.env.APP_URL)
    console.log(
      "Redirect URI for token exchange:",
      `${process.env.APP_URL}/auth/google/callback`
    )
    console.log("==================================")

    // Exchange code for access token
    const tokenParams = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${process.env.APP_URL}/auth/google/callback`,
    })

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenParams,
    })

    const tokenData = await tokenResponse.json()
    console.log("Token response:", tokenData)

    if (tokenData.error) {
      console.error("Token exchange error:", tokenData)
      const errorUrl = `exp://127.0.0.1:8081/--/auth/callback?error=${encodeURIComponent(
        tokenData.error_description || "Token exchange failed"
      )}`
      return res.redirect(errorUrl)
    }

    const { access_token } = tokenData

    // Get user info from Google
    const userResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    )

    const googleUser = await userResponse.json()

    // Find or create user in your database
    let user = await User.findOne({ email: googleUser.email })

    if (!user) {
      user = new User({
        email: googleUser.email,
        name: googleUser.name,
        profilePicture: googleUser.picture,
        googleId: googleUser.id,
        isEmailVerified: true, // Google emails are verified
      })
      await user.save()
    } else {
      // Update user info if needed
      user.googleId = googleUser.id
      user.profilePicture = googleUser.picture
      user.isEmailVerified = true
      await user.save()
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    )

    // Redirect to your app with the token
    // For web: redirect to HTTP URL with callback page, for mobile: use deep link
    const isWeb =
      req.get("User-Agent")?.includes("Mozilla") || req.query.platform === "web"

    let redirectUrl
    if (isWeb) {
      // For web browsers, redirect to React app callback route
      redirectUrl = `http://localhost:8081/AuthCallback?token=${token}&user=${encodeURIComponent(
        JSON.stringify({
          _id: user._id,
          email: user.email,
          name: user.name,
          profilePicture: user.profilePicture,
        })
      )}`
    } else {
      // For mobile apps, use deep link
      redirectUrl = `exp://127.0.0.1:8081/--/auth/callback?token=${token}&user=${encodeURIComponent(
        JSON.stringify({
          _id: user._id,
          email: user.email,
          name: user.name,
          profilePicture: user.profilePicture,
        })
      )}`
    }

    console.log("Redirecting to:", redirectUrl)
    res.redirect(redirectUrl)
  } catch (error) {
    console.error("Google auth error:", error)
    const errorUrl = `exp://127.0.0.1:8081/--/auth/callback?error=${encodeURIComponent(
      "Kirjautuminen epäonnistui"
    )}`
    res.redirect(errorUrl)
  }
})

// Social auth endpoint for mobile app
router.post("/social", async (req, res) => {
  try {
    const { provider, token } = req.body

    let googleUser

    if (provider === "google") {
      // Verify Google token
      const userResponse = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      googleUser = await userResponse.json()
    } else if (provider === "demo") {
      // Demo mode for testing
      googleUser = {
        email: "demo@gmail.com",
        name: "Demo User",
        picture: "https://via.placeholder.com/150",
        id: "demo123",
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "Tuntematon palveluntarjoaja",
      })
    }

    // Find or create user
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

    // Generate JWT token
    const jwtToken = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    )

    res.json({
      success: true,
      token: jwtToken,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        profilePicture: user.profilePicture,
      },
    })
  } catch (error) {
    console.error("Social auth error:", error)
    res.status(500).json({
      success: false,
      message: "Sosiaalinen kirjautuminen epäonnistui",
    })
  }
})

// Forgot Password
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Sähköpostiosoite on pakollinen",
      })
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() })

    if (!user) {
      // For security, don't reveal if email exists or not
      return res.status(200).json({
        success: true,
        message:
          "Jos sähköpostiosoite löytyy järjestelmästä, lähetämme ohjeet salasanan vaihtamiseen.",
      })
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex")
    const resetTokenExpiry = new Date(Date.now() + 3600000) // 1 hour from now

    // Save reset token to user
    user.resetPasswordToken = resetToken
    user.resetPasswordExpiry = resetTokenExpiry
    await user.save()

    // Create email transporter (you'll need to configure this with your email service)
    const transporter = nodemailer.createTransport({
      service: "gmail", // or your email service
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    })

    // Email content
    const resetUrl = `${process.env.APP_URL}/reset-password?token=${resetToken}`
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: user.email,
      subject: "Arkiapuri - Salasanan vaihto",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #9C86FC;">Salasanan vaihto</h2>
          <p>Hei ${user.name},</p>
          <p>Olet pyytänyt salasanan vaihtoa Arkiapuri-sovellukseen.</p>
          <p>Klikkaa alla olevaa linkkiä vaihtaaksesi salasanasi:</p>
          <a href="${resetUrl}" style="display: inline-block; background-color: #9C86FC; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">
            Vaihda salasana
          </a>
          <p>Tämä linkki on voimassa 1 tunnin ajan.</p>
          <p>Jos et pyytänyt salasanan vaihtoa, voit jättää tämän viestin huomiotta.</p>
          <p>Ystävällisin terveisin,<br>Arkiapuri-tiimi</p>
        </div>
      `,
    }

    // Send email
    await transporter.sendMail(mailOptions)

    res.status(200).json({
      success: true,
      message: "Ohjeet salasanan vaihtamiseen on lähetetty sähköpostiisi.",
    })
  } catch (error) {
    console.error("Forgot password error:", error)
    res.status(500).json({
      success: false,
      message: "Palvelinvirhe. Yritä myöhemmin uudelleen.",
    })
  }
})

// Reset Password
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Token ja uusi salasana ovat pakollisia",
      })
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Salasanan pituuden tulee olla vähintään 6 merkkiä",
      })
    }

    // Find user with valid reset token
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpiry: { $gt: new Date() },
    })

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Virheellinen tai vanhentunut token",
      })
    }

    // Update password and clear reset token
    user.password = newPassword // This will be hashed by the pre-save middleware
    user.resetPasswordToken = undefined
    user.resetPasswordExpiry = undefined
    await user.save()

    res.status(200).json({
      success: true,
      message: "Salasana vaihdettu onnistuneesti",
    })
  } catch (error) {
    console.error("Reset password error:", error)
    res.status(500).json({
      success: false,
      message: "Palvelinvirhe. Yritä myöhemmin uudelleen.",
    })
  }
})

module.exports = router
