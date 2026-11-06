import type { IUser } from "../models/user"

/** Safe user payload for API responses (no secrets). */
export const toPublicUser = (user: IUser | null | undefined) => {
  if (!user) return null
  const obj =
    typeof (user as { toObject?: () => Record<string, unknown> }).toObject ===
    "function"
      ? (user as { toObject: () => Record<string, unknown> }).toObject()
      : (user as unknown as Record<string, unknown>)

  const {
    password: _password,
    resetPasswordToken: _resetPasswordToken,
    resetPasswordExpiry: _resetPasswordExpiry,
    emailVerifyToken: _emailVerifyToken,
    emailVerifyExpiry: _emailVerifyExpiry,
    tokenVersion: _tokenVersion,
    googleId: _googleId,
    facebookId: _facebookId,
    appleId: _appleId,
    ...safe
  } = obj

  return safe
}
