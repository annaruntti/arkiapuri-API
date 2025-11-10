const jwt = require("jsonwebtoken")
const User = require("../models/user")
const Household = require("../models/household")
const Invitation = require("../models/invitation")
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

  // Check if user has a pending invitation
  const pendingInvitation = await Invitation.findOne({
    email: email.toLowerCase(),
    status: "pending",
    expiresAt: { $gt: new Date() }
  })

  // Only create a household if there's no pending invitation
  if (!pendingInvitation) {
    try {
      const household = new Household({
        name: `${username}n perhe`,
        owner: user._id,
        members: [
          {
            userId: user._id,
            role: "owner",
            joinedAt: new Date(),
          },
        ],
      })
      await household.save()

      // Update user with household reference
      user.household = household._id
      await user.save()
    } catch (householdError) {
      console.error("Error creating household for new user:", householdError)
      // Continue even if household creation fails
    }
  } else {
    console.log(`User ${email} has pending invitation - skipping household creation`)
  }

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

exports.updateUserProfile = async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body
    const userId = req.user._id

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" })
    }

    // Update username if provided
    if (username && username !== user.username) {
      user.username = username
    }

    // Update password if provided
    if (currentPassword && newPassword) {
      // Verify current password
      const isMatch = await user.comparePassword(currentPassword)
      if (!isMatch) {
        return res.status(400).json({ 
          success: false, 
          message: "Nykyinen salasana on virheellinen" 
        })
      }

      // Update to new password
      user.password = newPassword
    }

    await user.save()

    // Return updated user without password
    const updatedUser = await User.findById(userId).select("-password")
    
    res.json({ 
      success: true, 
      user: updatedUser,
      message: "Profile updated successfully" 
    })
  } catch (error) {
    console.error("Error updating user profile:", error)
    res.status(500).json({ success: false, message: "Server error" })
  }
}

exports.deleteUserAccount = async (req, res) => {
  try {
    const userId = req.user._id

    const user = await User.findById(userId).populate('household')
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" })
    }

    // If user has a household, remove them from it
    if (user.household) {
      const Household = require("../models/household")
      const household = await Household.findById(user.household)
      
      if (household) {
        // Remove user from household members
        household.members = household.members.filter(
          memberId => memberId.toString() !== userId.toString()
        )

        // If user was the admin and there are other members, assign new admin
        if (household.admin && household.admin.toString() === userId.toString()) {
          if (household.members.length > 0) {
            household.admin = household.members[0]
            await household.save()
          } else {
            // If no other members, delete the household
            await Household.findByIdAndDelete(household._id)
          }
        } else {
          await household.save()
        }
      }
    }

    // Delete any invitations sent by this user
    const Invitation = require("../models/invitation")
    await Invitation.deleteMany({ invitedBy: userId })

    // Delete any pending invitations for this user's email
    await Invitation.deleteMany({ email: user.email.toLowerCase() })

    // Delete the user
    await User.findByIdAndDelete(userId)

    res.json({ 
      success: true, 
      message: "Account deleted successfully" 
    })
  } catch (error) {
    console.error("Error deleting user account:", error)
    res.status(500).json({ success: false, message: "Server error" })
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
