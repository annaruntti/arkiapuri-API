import crypto from "crypto"
import type { IUser, IUserModel } from "../models/user"
import { resolveModule } from "../helpers/controllerUtils"
import { hashResetToken } from "../helpers/passwordPolicy"
import { sendEmailVerification } from "./emailService"

const User = resolveModule<IUserModel>(require("../models/user"))

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000

export const issueEmailVerification = async (
  user: IUser
): Promise<{ success: boolean; error?: string }> => {
  const raw = crypto.randomBytes(32).toString("hex")
  user.emailVerifyToken = hashResetToken(raw)
  user.emailVerifyExpiry = new Date(Date.now() + VERIFY_TTL_MS)
  await user.save()

  const webUrl = (process.env.WEB_URL || "http://localhost:8081").replace(
    /\/$/,
    ""
  )
  const verifyUrl = `${webUrl}/verify-email?token=${raw}`

  const result = await sendEmailVerification({
    to: user.email,
    name: user.username || user.name,
    verifyUrl,
  })
  return { success: result.success, error: result.error }
}

export type VerifyEmailResult =
  | { status: "ok"; message: string }
  | { status: "bad_request"; message: string }

export const verifyEmailWithToken = async (
  tokenRaw: unknown
): Promise<VerifyEmailResult> => {
  if (typeof tokenRaw !== "string" || !tokenRaw.trim()) {
    return { status: "bad_request", message: "Token vaaditaan" }
  }

  const user = await User.findOne({
    emailVerifyToken: hashResetToken(tokenRaw.trim()),
    emailVerifyExpiry: { $gt: new Date() },
  })

  if (!user) {
    return {
      status: "bad_request",
      message: "Virheellinen tai vanhentunut vahvistuslinkki",
    }
  }

  user.isEmailVerified = true
  user.emailVerifyToken = undefined
  user.emailVerifyExpiry = undefined
  await user.save()

  return { status: "ok", message: "Sähköposti vahvistettu" }
}
