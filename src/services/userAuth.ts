import type { Model } from "mongoose"
import type { IHousehold } from "../models/household"
import type { IInvitation } from "../models/invitation"
import type { IUser, IUserModel } from "../models/user"
import { resolveModule } from "../helpers/controllerUtils"
import { EMAIL_TOKEN_TTL, signUserToken } from "../helpers/authToken"

const User = resolveModule<IUserModel>(require("../models/user"))
const Household = resolveModule<Model<IHousehold>>(require("../models/household"))
const Invitation = resolveModule<Model<IInvitation>>(
  require("../models/invitation")
)

export type UserAuthResult =
  | {
      status: "ok"
      user: IUser | null
      token?: string
      message?: string
    }
  | { status: "bad_request" | "conflict"; message: string }

export const registerUser = async ({
  username,
  email,
  password,
}: {
  username?: string
  email?: string
  password?: string
}): Promise<UserAuthResult> => {
  if (!username || !email || !password) {
    return {
      status: "bad_request",
      message: "Username, email and password are required",
    }
  }

  const isNewUser = await User.isThisEmailInUse(email)
  if (!isNewUser) {
    return {
      status: "conflict",
      message: "This email is already in use, try sign-in",
    }
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

  return { status: "ok", user }
}

export const signInUser = async ({
  email,
  password,
}: {
  email?: string
  password?: string
}): Promise<UserAuthResult> => {
  if (!email || !password) {
    return {
      status: "bad_request",
      message: "email / password does not match!",
    }
  }

  const user = await User.findOne({ email })

  if (!user) {
    return {
      status: "bad_request",
      message: "user not found, with the given email!",
    }
  }

  const isMatch = await user.comparePassword(password)
  if (!isMatch) {
    return {
      status: "bad_request",
      message: "email / password does not match!",
    }
  }

  const token = signUserToken(user, EMAIL_TOKEN_TTL)

  const populatedUser = await User.findById(user._id)
    .select("-password")
    .populate("foodItems")
    .populate("meals")

  return { status: "ok", user: populatedUser, token }
}
