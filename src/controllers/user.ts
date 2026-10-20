import { Request, Response } from "express"
import type { Model } from "mongoose"
import fs from "fs"
import cloudinary from "../helpers/imageUpload"
import type { IUserModel } from "../models/user"
import type { IHousehold } from "../models/household"
import type { IInvitation } from "../models/invitation"
import {
  AuthenticatedRequest,
  getErrorMessage,
  isCloudinaryConfigured,
  resolveModule,
} from "../helpers/controllerUtils"
import { EMAIL_TOKEN_TTL, revokeUserTokens, signUserToken } from "../helpers/authToken"
import { getPasswordLengthError } from "../helpers/passwordPolicy"
import { registerUser, signInUser } from "../services/userAuth"

const User = resolveModule<IUserModel>(require("../models/user"))
const Household = resolveModule<Model<IHousehold>>(require("../models/household"))
const Invitation = resolveModule<Model<IInvitation>>(
  require("../models/invitation")
)

export const createUser = async (
  req: Request<
    Record<string, string>,
    unknown,
    { username?: string; email?: string; password?: string }
  >,
  res: Response
) => {
  try {
    const result = await registerUser(req.body)
    if (result.status !== "ok") {
      const statusCode = result.status === "conflict" ? 200 : 400
      return res.status(statusCode).json({
        success: false,
        message: result.message,
      })
    }
    res.json({ success: true, user: result.user })
  } catch (error: unknown) {
    console.error("Error creating user:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const userSignIn = async (
  req: Request<
    Record<string, string>,
    unknown,
    { email?: string; password?: string }
  >,
  res: Response
) => {
  try {
    const result = await signInUser(req.body)
    if (result.status !== "ok") {
      return res.json({
        success: false,
        message: result.message,
      })
    }
    res.json({ success: true, user: result.user, token: result.token })
  } catch (error: unknown) {
    console.error("Error signing in:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const uploadProfile = async (
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

export const signOut = async (req: AuthenticatedRequest, res: Response) => {
  try {
    await revokeUserTokens(req.user._id)
    res.json({ success: true, message: "Sign out successfully!" })
  } catch (error: unknown) {
    console.error("Error signing out:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const getUserProfile = async (
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

export const updateUserProfile = async (
  req: AuthenticatedRequest<
    Record<string, string>,
    unknown,
    {
      username?: string
      currentPassword?: string
      newPassword?: string
      preferences?: {
        showNutrition?: boolean
        personalizationCompleted?: boolean
      }
    }
  >,
  res: Response
) => {
  try {
    const { username, currentPassword, newPassword, preferences } = req.body
    const userId = req.user._id

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" })
    }

    if (username && username !== user.username) {
      user.username = username
    }

    const passwordChanged = Boolean(currentPassword && newPassword)
    if (passwordChanged) {
      const isMatch = await user.comparePassword(currentPassword)
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: "Nykyinen salasana on virheellinen",
        })
      }
      const passwordError = getPasswordLengthError(newPassword)
      if (passwordError) {
        return res.status(400).json({
          success: false,
          message: passwordError,
        })
      }
      user.password = newPassword
    }

    if (preferences && typeof preferences === "object") {
      if (!user.preferences) {
        user.preferences = {
          showNutrition: true,
          personalizationCompleted: false,
        }
      }
      if (typeof preferences.showNutrition === "boolean") {
        user.preferences.showNutrition = preferences.showNutrition
      }
      if (typeof preferences.personalizationCompleted === "boolean") {
        user.preferences.personalizationCompleted =
          preferences.personalizationCompleted
      }
      user.markModified("preferences")
    }

    await user.save()

    const updatedUser = await User.findById(userId).select("-password")
    const token = passwordChanged
      ? signUserToken(user, EMAIL_TOKEN_TTL)
      : undefined

    res.json({
      success: true,
      user: updatedUser,
      ...(token ? { token } : {}),
      message: "Profile updated successfully",
    })
  } catch (error: unknown) {
    console.error("Error updating user profile:", error)
    res.status(500).json({ success: false, message: "Server error" })
  }
}

export const deleteUserAccount = async (
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

export const uploadProfileImage = async (
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
