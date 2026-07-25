import { Request, Response } from "express"
import type { Model } from "mongoose"
import jwt from "jsonwebtoken"
import fs from "fs"
import cloudinary from "../helper/imageUpload"
import type { IUserModel } from "../models/user"
import type { IHousehold } from "../models/household"
import type { IInvitation } from "../models/invitation"
import {
  AuthenticatedRequest,
  getErrorMessage,
  isCloudinaryConfigured,
  resolveModule,
} from "../helpers/controllerUtils"

const User = resolveModule<IUserModel>(require("../models/user"))
const Household = resolveModule<Model<IHousehold>>(require("../models/household"))
const Invitation = resolveModule<Model<IInvitation>>(
  require("../models/invitation")
)

exports.createUser = async (
  req: Request<
    Record<string, string>,
    unknown,
    { username?: string; email?: string; password?: string }
  >,
  res: Response
) => {
  try {
    const { username, email, password } = req.body

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Username, email and password are required",
      })
    }

    const isNewUser = await User.isThisEmailInUse(email)
    if (!isNewUser) {
      return res.json({
        success: false,
        message: "This email is already in use, try sign-in",
      })
    }

    const user = new User({ username, email, password })
    await user.save()

    const pendingInvitation = await Invitation.findOne({
      email: email.toLowerCase(),
      status: "pending",
      expiresAt: { $gt: new Date() },
    })

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

        user.household = household._id
        await user.save()
      } catch (householdError) {
        console.error("Error creating household for new user:", householdError)
      }
    } else {
      console.log(
        `User ${email} has pending invitation - skipping household creation`
      )
    }

    res.json({ success: true, user })
  } catch (error: unknown) {
    console.error("Error creating user:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

exports.userSignIn = async (
  req: Request<
    Record<string, string>,
    unknown,
    { email?: string; password?: string }
  >,
  res: Response
) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.json({
        success: false,
        message: "email / password does not match!",
      })
    }

    const user = await User.findOne({ email })

    if (!user) {
      return res.json({
        success: false,
        message: "user not found, with the given email!",
      })
    }

    const isMatch = await user.comparePassword(password)
    if (!isMatch) {
      return res.json({
        success: false,
        message: "email / password does not match!",
      })
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET as string,
      { expiresIn: "1d" }
    )

    const populatedUser = await User.findById(user._id)
      .select("-password")
      .populate("foodItems")
      .populate("meals")

    res.json({ success: true, user: populatedUser, token })
  } catch (error: unknown) {
    console.error("Error signing in:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

exports.uploadProfile = async (
  req: AuthenticatedRequest & { file?: Express.Multer.File },
  res: Response
) => {
  if (!req.user) {
    return res
      .status(401)
      .json({ success: false, message: "unauthorized access!" })
  }

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided",
      })
    }

    const result = await cloudinary.uploader.upload(req.file.path, {
      public_id: `${req.user._id}_profile`,
      width: 500,
      height: 500,
      crop: "fill",
    })

    await User.findByIdAndUpdate(req.user._id, { avatar: result.url })
    res
      .status(201)
      .json({ success: true, message: "Your profile has updated!" })
  } catch (error: unknown) {
    console.log("Error while uploading profile image", getErrorMessage(error))
    res
      .status(500)
      .json({ success: false, message: "server error, try after some time" })
  }
}

exports.signOut = async (req: AuthenticatedRequest, res: Response) => {
  // Stateless JWT auth: client discards the token. No server-side token store.
  if (!req.headers?.authorization) {
    return res
      .status(401)
      .json({ success: false, message: "Authorization fail!" })
  }

  const token = req.headers.authorization.split(" ")[1]
  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Authorization fail!" })
  }

  res.json({ success: true, message: "Sign out successfully!" })
}

exports.getUserProfile = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const user = await User.findById(req.user._id)
      .select("-password")
      .populate("foodItems")
      .populate({
        path: "meals",
        populate: { path: "foodItems" },
      })

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    res.json({ success: true, user })
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    })
  }
}

exports.updateUserProfile = async (
  req: AuthenticatedRequest<
    Record<string, string>,
    unknown,
    { username?: string; currentPassword?: string; newPassword?: string }
  >,
  res: Response
) => {
  try {
    const { username, currentPassword, newPassword } = req.body
    const userId = req.user._id

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" })
    }

    if (username && username !== user.username) {
      user.username = username
    }

    if (currentPassword && newPassword) {
      const isMatch = await user.comparePassword(currentPassword)
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: "Nykyinen salasana on virheellinen",
        })
      }
      user.password = newPassword
    }

    await user.save()

    const updatedUser = await User.findById(userId).select("-password")

    res.json({
      success: true,
      user: updatedUser,
      message: "Profile updated successfully",
    })
  } catch (error: unknown) {
    console.error("Error updating user profile:", error)
    res.status(500).json({ success: false, message: "Server error" })
  }
}

exports.deleteUserAccount = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user._id

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" })
    }

    if (user.household) {
      const household = await Household.findById(user.household)

      if (household) {
        const isOwner = household.owner.toString() === userId.toString()
        const remainingMembers = household.members.filter(
          (member) => member.userId.toString() !== userId.toString()
        )

        if (isOwner) {
          if (remainingMembers.length === 0) {
            await Household.findByIdAndDelete(household._id)
          } else {
            const newOwner = remainingMembers[0]
            household.owner = newOwner.userId
            newOwner.role = "owner"
            household.members = remainingMembers
            await household.save()
          }
        } else {
          household.members = remainingMembers
          await household.save()
        }
      }
    }

    await Invitation.deleteMany({ invitedBy: userId })
    await Invitation.deleteMany({ email: user.email.toLowerCase() })
    await User.findByIdAndDelete(userId)

    res.json({
      success: true,
      message: "Account deleted successfully",
    })
  } catch (error: unknown) {
    console.error("Error deleting user account:", error)
    res.status(500).json({ success: false, message: "Server error" })
  }
}

exports.uploadProfileImage = async (
  req: AuthenticatedRequest & { file?: Express.Multer.File },
  res: Response
) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided",
      })
    }

    if (!isCloudinaryConfigured()) {
      return res.status(500).json({
        success: false,
        message: "Cloud storage not configured",
      })
    }

    try {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "profile-images",
        use_filename: true,
      })

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

      fs.unlinkSync(req.file.path)

      res.json({ success: true, user })
    } catch (uploadError: unknown) {
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path)
      }
      throw uploadError
    }
  } catch (error: unknown) {
    console.error("Upload error:", error)
    res.status(500).json({
      success: false,
      message: "Image upload failed",
      error: getErrorMessage(error),
    })
  }
}
