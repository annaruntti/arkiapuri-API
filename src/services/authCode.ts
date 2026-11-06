import crypto from "crypto"
import type { Model } from "mongoose"
import mongoose, { Schema, Document } from "mongoose"
import type { IUser } from "../models/user"
import { SOCIAL_TOKEN_TTL, signUserToken } from "../helpers/authToken"
import { resolveModule } from "../helpers/controllerUtils"

export interface IAuthCode extends Document {
  codeHash: string
  userId: mongoose.Types.ObjectId
  provider: string
  expiresAt: Date
  usedAt?: Date | null
  createdAt: Date
}

const authCodeSchema = new Schema<IAuthCode>(
  {
    codeHash: { type: String, required: true, unique: true, index: true },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    provider: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

authCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const AuthCode =
  (mongoose.models.AuthCode as Model<IAuthCode>) ||
  mongoose.model<IAuthCode>("AuthCode", authCodeSchema)

const User = resolveModule(require("../models/user"))

const hashCode = (code: string) =>
  crypto.createHash("sha256").update(code).digest("hex")

const AUTH_CODE_TTL_MS = 60_000

/**
 * Create a one-time auth code for OAuth redirect (never put JWT in the URL).
 */
export const createAuthCodeForUser = async (
  user: { _id: unknown },
  provider: string
): Promise<string> => {
  const code = crypto.randomBytes(32).toString("hex")
  await AuthCode.create({
    codeHash: hashCode(code),
    userId: user._id,
    provider,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
  })
  return code
}

export type ExchangeAuthCodeResult =
  | {
      status: "ok"
      token: string
      user: {
        _id: unknown
        email: string
        name?: string
        profilePicture?: string
      }
    }
  | { status: "bad_request"; message: string }

/**
 * Exchange a one-time code for a session JWT.
 */
export const exchangeAuthCode = async (
  codeRaw: unknown
): Promise<ExchangeAuthCodeResult> => {
  if (typeof codeRaw !== "string" || !codeRaw.trim()) {
    return { status: "bad_request", message: "Koodi vaaditaan" }
  }
  const code = codeRaw.trim()
  const record = await AuthCode.findOneAndUpdate(
    {
      codeHash: hashCode(code),
      usedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { usedAt: new Date() } },
    { new: true }
  )

  if (!record) {
    return { status: "bad_request", message: "Koodi on virheellinen tai vanhentunut" }
  }

  const user = (await User.findById(record.userId)) as IUser | null
  if (!user) {
    return { status: "bad_request", message: "Käyttäjää ei löytynyt" }
  }

  const token = signUserToken(user, SOCIAL_TOKEN_TTL)
  return {
    status: "ok",
    token,
    user: {
      _id: user._id,
      email: user.email,
      name: user.name,
      profilePicture: user.profilePicture,
    },
  }
}
