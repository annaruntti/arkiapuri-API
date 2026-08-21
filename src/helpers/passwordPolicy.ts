import crypto from "crypto"

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128
export const BCRYPT_ROUNDS = 12

export const hashResetToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex")

export const getPasswordLengthError = (password: string): string | null => {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Salasanan pituuden tulee olla vähintään ${PASSWORD_MIN_LENGTH} merkkiä`
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Salasanan pituuden tulee olla enintään ${PASSWORD_MAX_LENGTH} merkkiä`
  }
  return null
}
