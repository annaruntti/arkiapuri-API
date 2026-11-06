import type { IUser } from "../models/user"
import { resolveModule } from "../helpers/controllerUtils"
import type { IUserModel } from "../models/user"

const User = resolveModule<IUserModel>(require("../models/user"))

export type SocialProfile = {
  email?: string | null
  emailVerified?: boolean
  name?: string | null
  picture?: string | null
  providerId: string
  provider: "google" | "apple" | "facebook"
}

export type LinkSocialResult =
  | { status: "ok"; user: IUser }
  | { status: "conflict"; message: string }

const providerIdField = (
  provider: SocialProfile["provider"]
): "googleId" | "appleId" | "facebookId" => {
  if (provider === "google") return "googleId"
  if (provider === "apple") return "appleId"
  return "facebookId"
}

/**
 * Find or create a user for a social login without hijacking unverified email accounts.
 */
export const linkOrCreateSocialUser = async (
  profile: SocialProfile
): Promise<LinkSocialResult> => {
  const idField = providerIdField(profile.provider)
  const byProvider = await User.findOne({ [idField]: profile.providerId })
  if (byProvider) {
    if (profile.picture && !byProvider.profilePicture) {
      byProvider.profilePicture = profile.picture
      await byProvider.save()
    }
    return { status: "ok", user: byProvider }
  }

  const email = profile.email ? String(profile.email).toLowerCase().trim() : null
  const providerVerified = Boolean(profile.emailVerified && email)

  if (email) {
    const byEmail = await User.findOne({ email })
    if (byEmail) {
      const alreadyLinked =
        Boolean(byEmail.googleId) ||
        Boolean(byEmail.appleId) ||
        Boolean(byEmail.facebookId)

      // Only auto-link when the account email is already verified, or the
      // provider asserts a verified email for this address.
      if (!byEmail.isEmailVerified && !providerVerified) {
        return {
          status: "conflict",
          message:
            "Tili tällä sähköpostilla on jo olemassa. Kirjaudu salasanalla ja yhdistä tili asetuksista.",
        }
      }

      byEmail[idField] = profile.providerId
      if (profile.picture) byEmail.profilePicture = profile.picture
      if (profile.name && !byEmail.name) byEmail.name = profile.name
      if (providerVerified || byEmail.isEmailVerified) {
        byEmail.isEmailVerified = true
      }
      // Invalidate existing sessions/password after social link hardening.
      byEmail.tokenVersion = (Number(byEmail.tokenVersion) || 0) + 1
      if (!alreadyLinked && byEmail.password && providerVerified) {
        byEmail.password = undefined
      }
      await byEmail.save()
      return { status: "ok", user: byEmail }
    }
  }

  const placeholderEmail =
    email || `${profile.providerId}@${profile.provider}.user`

  const user = new User({
    email: placeholderEmail,
    name: profile.name || placeholderEmail.split("@")[0],
    profilePicture: profile.picture || undefined,
    [idField]: profile.providerId,
    isEmailVerified: providerVerified,
  })
  await user.save()
  return { status: "ok", user }
}
