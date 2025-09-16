const jwt = require("jsonwebtoken")
const User = require("../models/user")
const sharp = require("sharp")
const cloudinary = require("../helper/imageUpload")
const cloudinaryV2 = require("cloudinary").v2
const { Readable } = require("stream")
const fs = require("fs")

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_USER_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_KEY_SECRET,
})

exports.createUser = async (req, res) => {
  const { username, email, password } = req.body
  const isNewUser = await User.isThisEmailInUse(email)
  if (!isNewUser)
    return res.json({
      success: false,
      message: "This email is already in use, try sign-in",
    })
  const user = await User({
    username,
    email,
    password,
  })
  await user.save()
  res.json({ success: true, user })
}

exports.userSignIn = async (req, res) => {
  const { email, password } = req.body

  const user = await User.findOne({ email })

  if (!user)
    return res.json({
      success: false,
      message: "user not found, with the given email!",
    })

  const isMatch = await user.comparePassword(password)
  if (!isMatch)
    return res.json({
      success: false,
      message: "email / password does not match!",
    })

  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
    expiresIn: "1d",
  })

  let oldTokens = user.tokens || []

  if (oldTokens.length) {
    oldTokens = oldTokens.filter((t) => {
      const timeDiff = (Date.now() - parseInt(t.signedAt)) / 1000
      if (timeDiff < 86400) {
        return t
      }
    })
  }

  await User.findByIdAndUpdate(user._id, {
    tokens: [...oldTokens, { token, signedAt: Date.now().toString() }],
  })

  const userInfo = {
    username: user.username,
    email: user.email,
    avatar: user.avatar ? user.avatar : "",
  }

  const populatedUser = await User.findById(user._id)
    .select("-password")
    .populate("foodItems")
    .populate("meals")

  res.json({ success: true, user: populatedUser, token })
}

exports.uploadProfile = async (req, res) => {
  const { user } = req
  if (!user)
    return res
      .status(401)
      .json({ success: false, message: "unauthorized access!" })

  try {
    const result = await cloudinary.uploader.upload(req.file.path, {
      public_id: `${user._id}_profile`,
      width: 500,
      height: 500,
      crop: "fill",
    })

    await User.findByIdAndUpdate(user._id, { avatar: result.url })
    res
      .status(201)
      .json({ success: true, message: "Your profile has updated!" })
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "server error, try after some time" })
    console.log("Error while uploading profile image", error.message)
  }
}

exports.signOut = async (req, res) => {
  if (req.headers && req.headers.authorization) {
    const token = req.headers.authorization.split(" ")[1]
    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "Authorization fail!" })
    }

    const tokens = req.user.tokens

    const newTokens = tokens.filter((t) => t.token !== token)

    await User.findByIdAndUpdate(req.user._id, { tokens: newTokens })
    res.json({ success: true, message: "Sign out successfully!" })
  }
}

exports.getUserProfile = async (req, res) => {
  try {
    // Find user and populate their food items and meals
    const user = await User.findById(req.user._id)
      .select("-password") // Exclude password
      .populate("foodItems")
      .populate({
        path: "meals",
        populate: {
          path: "foodItems", // Populate food items within meals
        },
      })

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    res.json({
      success: true,
      user,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}

exports.uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided",
      })
    }

    // Check Cloudinary credentials
    if (
      !process.env.CLOUDINARY_USER_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_KEY_SECRET
    ) {
      return res.status(500).json({
        success: false,
        message: "Cloud storage not configured",
      })
    }

    try {
      // Upload to Cloudinary
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "profile-images",
        use_filename: true,
      })

      // Update user profile
      const user = await User.findByIdAndUpdate(
        req.user._id,
        {
          profileImage: {
            url: result.secure_url,
            publicId: result.public_id,
          },
        },
        { new: true }
      ).select("-password")

      // Clean up the uploaded file
      fs.unlinkSync(req.file.path)

      res.json({
        success: true,
        user,
      })
    } catch (uploadError) {
      // Clean up the uploaded file in case of error
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path)
      }
      throw uploadError
    }
  } catch (error) {
    console.error("Upload error:", error)
    res.status(500).json({
      success: false,
      message: "Image upload failed",
      error: error.message,
    })
  }
}
