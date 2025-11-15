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

// Apple OAuth
router.get("/apple", (req, res) => {
  const appleAuthUrl = "https://appleid.apple.com/auth/authorize"
  const clientId = process.env.APPLE_CLIENT_ID || process.env.APPLE_SERVICE_ID
  const redirectUri = `${process.env.APP_URL}/auth/apple/callback`

  console.log("=== Apple OAuth Debug ===")
  console.log("APP_URL:", process.env.APP_URL)
  console.log("APPLE_CLIENT_ID:", clientId)
  console.log("Redirect URI being sent to Apple:", redirectUri)
  console.log("========================")

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
router.post("/apple/callback", async (req, res) => {
  try {
    const { code, user } = req.body

    console.log("=== Apple OAuth Callback Debug ===")
    console.log("Received code:", code ? "YES" : "NO")
    console.log("Received user data:", user ? "YES" : "NO")
    console.log("APP_URL:", process.env.APP_URL)
    console.log("==================================")

    // Exchange code for access token
    const tokenParams = new URLSearchParams({
      client_id: process.env.APPLE_CLIENT_ID || process.env.APPLE_SERVICE_ID,
      client_secret: process.env.APPLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${process.env.APP_URL}/auth/apple/callback`,
    })

    const tokenResponse = await fetch("https://appleid.apple.com/auth/token", {
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
      return res.redirect(
        `http://localhost:8081/AuthCallback?provider=apple&error=${encodeURIComponent(
          tokenData.error_description || "Token exchange failed"
        )}`
      )
    }

    const { id_token } = tokenData

    // Decode the ID token to get user info
    const base64Payload = id_token.split(".")[1]
    const payload = Buffer.from(base64Payload, "base64").toString()
    const appleUser = JSON.parse(payload)

    console.log("Apple user from token:", appleUser)

    // Parse user data from the initial request if available
    let userName = null
    if (user) {
      try {
        const userData = typeof user === "string" ? JSON.parse(user) : user
        if (userData.name) {
          userName = `${userData.name.firstName || ""} ${
            userData.name.lastName || ""
          }`.trim()
        }
      } catch (e) {
        console.error("Error parsing user data:", e)
      }
    }

    // Find or create user in your database
    let dbUser = await User.findOne({ email: appleUser.email })

    if (!dbUser) {
      dbUser = new User({
        email: appleUser.email,
        name: userName || appleUser.email.split("@")[0], // Use email prefix if no name
        appleId: appleUser.sub,
        isEmailVerified: true, // Apple emails are verified
      })
      await dbUser.save()
    } else {
      // Update user info if needed
      dbUser.appleId = appleUser.sub
      if (userName && !dbUser.name) {
        dbUser.name = userName
      }
      dbUser.isEmailVerified = true
      await dbUser.save()
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: dbUser._id, email: dbUser.email },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    )

    // Redirect to your app with the token (always web for Apple)
    const redirectUrl = `http://localhost:8081/AuthCallback?provider=apple&token=${token}&user=${encodeURIComponent(
      JSON.stringify({
        _id: dbUser._id,
        email: dbUser.email,
        name: dbUser.name,
        profilePicture: dbUser.profilePicture,
      })
    )}`

    console.log("Redirecting to:", redirectUrl)
    res.redirect(redirectUrl)
  } catch (error) {
    console.error("Apple auth error:", error)
    res.redirect(
      `http://localhost:8081/AuthCallback?provider=apple&error=${encodeURIComponent(
        "Kirjautuminen epäonnistui"
      )}`
    )
  }
})

// Facebook OAuth
router.get("/facebook", (req, res) => {
  const facebookAuthUrl = "https://www.facebook.com/v18.0/dialog/oauth"
  const clientId = process.env.FACEBOOK_APP_ID
  const redirectUri = `${process.env.APP_URL}/auth/facebook/callback`

  console.log("=== Facebook OAuth Debug ===")
  console.log("APP_URL:", process.env.APP_URL)
  console.log("FACEBOOK_APP_ID:", clientId)
  console.log("Redirect URI being sent to Facebook:", redirectUri)
  console.log("===========================")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "email,public_profile",
    state: crypto.randomBytes(16).toString("hex"), // CSRF protection
  })

  res.redirect(`${facebookAuthUrl}?${params}`)
})

// Facebook OAuth callback
router.get("/facebook/callback", async (req, res) => {
  try {
    const { code, error } = req.query

    console.log("=== Facebook OAuth Callback Debug ===")
    console.log("Received code:", code ? "YES" : "NO")
    console.log("Error:", error)
    console.log("APP_URL:", process.env.APP_URL)
    console.log("=====================================")

    if (error) {
      console.error("Facebook auth error:", error)
      return res.redirect(
        `http://localhost:8081/AuthCallback?provider=facebook&error=${encodeURIComponent(
          error
        )}`
      )
    }

    // Exchange code for access token
    const tokenParams = new URLSearchParams({
      client_id: process.env.FACEBOOK_APP_ID,
      client_secret: process.env.FACEBOOK_APP_SECRET,
      code,
      redirect_uri: `${process.env.APP_URL}/auth/facebook/callback`,
    })

    const tokenResponse = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?${tokenParams}`,
      {
        method: "GET",
      }
    )

    const tokenData = await tokenResponse.json()
    console.log("Token response:", tokenData)

    if (tokenData.error) {
      console.error("Token exchange error:", tokenData)
      return res.redirect(
        `http://localhost:8081/AuthCallback?provider=facebook&error=${encodeURIComponent(
          tokenData.error.message || "Token exchange failed"
        )}`
      )
    }

    const { access_token } = tokenData

    // Get user info from Facebook
    const userResponse = await fetch(
      `https://graph.facebook.com/v18.0/me?fields=id,name,email,picture&access_token=${access_token}`
    )

    const facebookUser = await userResponse.json()
    console.log("Facebook user:", facebookUser)

    if (!facebookUser.email) {
      return res.redirect(
        `http://localhost:8081/AuthCallback?provider=facebook&error=${encodeURIComponent(
          "Email permission is required"
        )}`
      )
    }

    // Find or create user in your database
    let dbUser = await User.findOne({ email: facebookUser.email })

    if (!dbUser) {
      dbUser = new User({
        email: facebookUser.email,
        name: facebookUser.name,
        profilePicture: facebookUser.picture?.data?.url,
        facebookId: facebookUser.id,
        isEmailVerified: true, // Facebook emails are verified
      })
      await dbUser.save()
    } else {
      // Update user info if needed
      dbUser.facebookId = facebookUser.id
      if (facebookUser.picture?.data?.url) {
        dbUser.profilePicture = facebookUser.picture.data.url
      }
      dbUser.isEmailVerified = true
      await dbUser.save()
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: dbUser._id, email: dbUser.email },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    )

    // Redirect to your app with the token
    const isWeb =
      req.get("User-Agent")?.includes("Mozilla") || req.query.platform === "web"

    let redirectUrl
    if (isWeb) {
      // For web browsers, redirect to React app callback route
      redirectUrl = `http://localhost:8081/AuthCallback?provider=facebook&token=${token}&user=${encodeURIComponent(
        JSON.stringify({
          _id: dbUser._id,
          email: dbUser.email,
          name: dbUser.name,
          profilePicture: dbUser.profilePicture,
        })
      )}`
    } else {
      // For mobile apps, use deep link
      redirectUrl = `exp://127.0.0.1:8081/--/auth/callback?provider=facebook&token=${token}&user=${encodeURIComponent(
        JSON.stringify({
          _id: dbUser._id,
          email: dbUser.email,
          name: dbUser.name,
          profilePicture: dbUser.profilePicture,
        })
      )}`
    }

    console.log("Redirecting to:", redirectUrl)
    res.redirect(redirectUrl)
  } catch (error) {
    console.error("Facebook auth error:", error)
    res.redirect(
      `http://localhost:8081/AuthCallback?provider=facebook&error=${encodeURIComponent(
        "Kirjautuminen epäonnistui"
      )}`
    )
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
