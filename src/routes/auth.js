const express = require("express")
const jwt = require("jsonwebtoken")
const User = require("../models/user")
const router = express.Router()

// Google OAuth
router.get("/google", (req, res) => {
  const googleAuthUrl = "https://accounts.google.com/o/oauth2/v2/auth"
  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = `${process.env.APP_URL}/auth/google/callback`

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
    const redirectUrl = `exp://127.0.0.1:8081/--/auth/callback?token=${token}&user=${encodeURIComponent(
      JSON.stringify({
        _id: user._id,
        email: user.email,
        name: user.name,
        profilePicture: user.profilePicture,
      })
    )}`

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

module.exports = router
