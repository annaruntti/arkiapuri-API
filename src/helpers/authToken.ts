import jwt, { type SignOptions } from "jsonwebtoken"
import User from "../models/user"

export const EMAIL_TOKEN_TTL = "1d" as const
export const SOCIAL_TOKEN_TTL = "7d" as const

export type AuthTokenPayload = {
  userId: string
  tokenVersion?: number
}

export const signUserToken = (
  user: { _id: unknown; tokenVersion?: number },
  expiresIn: SignOptions["expiresIn"]
): string =>
  jwt.sign(
    {
      userId: user._id,
      tokenVersion: Number(user.tokenVersion) || 0,
    },
    process.env.JWT_SECRET as string,
    { expiresIn }
  )

export const revokeUserTokens = async (userId: unknown): Promise<void> => {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } })
}
