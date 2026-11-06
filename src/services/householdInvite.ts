import { randomUUID } from "crypto"
import type { Model } from "mongoose"
import type { IHousehold } from "../models/household"
import type { IInvitation } from "../models/invitation"
import type { IUser, IUserModel } from "../models/user"
import { resolveModule } from "../helpers/controllerUtils"
import { getCanonicalPantry } from "../helpers/pantryHelpers"
import { shareHouseholdDocuments } from "../helpers/householdHelpers"
import { sendFamilyInvitation } from "./emailService"
import { householdIdForUser } from "./householdAccess"
import { parseInvitationToken } from "../helpers/invitationToken"

const Household = resolveModule<Model<IHousehold>>(
  require("../models/household")
)
const User = resolveModule<IUserModel>(require("../models/user"))
const Invitation = resolveModule<Model<IInvitation>>(
  require("../models/invitation")
)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type HouseholdInviteResult =
  | { status: "ok"; message: string }
  | {
      status: "bad_request" | "not_found" | "forbidden" | "server_error"
      message: string
      inviteLink?: string
    }

export const inviteUserToHousehold = async (
  user: IUser,
  emailRaw?: string
): Promise<HouseholdInviteResult> => {
  const email = String(emailRaw || "").trim()
  if (!email) {
    return { status: "bad_request", message: "Sähköpostiosoite vaaditaan" }
  }
  if (!EMAIL_REGEX.test(email)) {
    return { status: "bad_request", message: "Virheellinen sähköpostiosoite" }
  }

  const household = await Household.findById(householdIdForUser(user)).populate(
    "owner",
    "username email"
  )

  if (!household) {
    return { status: "not_found", message: "Perhettä ei löytynyt" }
  }

  if (!household.canInvite(user._id)) {
    return {
      status: "forbidden",
      message: "Sinulla ei ole oikeutta kutsua jäseniä",
    }
  }

  const existingUser = await User.findOne({ email: email.toLowerCase() })
  if (existingUser && household.isMember(existingUser._id)) {
    return {
      status: "bad_request",
      message: "Käyttäjä on jo perheenjäsen",
    }
  }

  const existingInvitation = await Invitation.findOne({
    email: email.toLowerCase(),
    household: household._id,
    status: "pending",
    expiresAt: { $gt: new Date() },
  })

  if (existingInvitation) {
    return {
      status: "bad_request",
      message: "Tällä sähköpostiosoitteella on jo odottava kutsu",
    }
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const invitesLastDay = await Invitation.countDocuments({
    invitedBy: user._id,
    createdAt: { $gte: dayAgo },
  })
  if (invitesLastDay >= 20) {
    return {
      status: "bad_request",
      message: "Liian monta kutsua tänään. Yritä huomenna uudelleen.",
    }
  }

  const pendingForHousehold = await Invitation.countDocuments({
    household: household._id,
    status: "pending",
    expiresAt: { $gt: new Date() },
  })
  if (pendingForHousehold >= 50) {
    return {
      status: "bad_request",
      message: "Perheellä on liian monta odottavaa kutsua",
    }
  }

  const invitationToken = randomUUID()
  const invitation = new Invitation({
    email: email.toLowerCase(),
    household: household._id,
    invitedBy: user._id,
    invitationToken,
    status: "pending",
  })

  await invitation.save()

  const frontendUrl = process.env.FRONTEND_URL || "arkiapuri://"
  const webUrl = process.env.WEB_URL || "http://localhost:8081"
  const inviteLink = `${frontendUrl}accept-invite/${invitationToken}`
  const webInviteLink = `${webUrl}/accept-invite/${invitationToken}`

  const emailResult = await sendFamilyInvitation({
    to: email,
    inviterName: user.username || user.email,
    householdName: household.name,
    inviteLink,
    webInviteLink,
    invitationToken,
  })

  if (!emailResult.success) {
    console.error("Failed to send invitation email:", emailResult.error)
    return {
      status: "server_error",
      message: `Kutsun luonti epäonnistui: sähköpostin lähetys epäonnistui (${
        emailResult.error || "unknown error"
      })`,
      inviteLink,
    }
  }

  return {
    status: "ok",
    message: `Kutsusähköposti lähetetty osoitteeseen ${email}`,
  }
}

export type AcceptInvitationResult =
  | {
      status: "ok"
      household: IHousehold | null
      message: string
    }
  | {
      status: "bad_request" | "not_found" | "forbidden"
      message: string
    }

export const acceptHouseholdInvitation = async (
  user: IUser,
  invitationToken?: unknown
): Promise<AcceptInvitationResult> => {
  const parsed = parseInvitationToken(invitationToken)
  if (parsed.ok === false) {
    return { status: "bad_request", message: parsed.message }
  }

  if (user.household) {
    return {
      status: "bad_request",
      message: "Olet jo osa perhettä. Poistu ensin nykyisestä perheestä.",
    }
  }

  const invitation = await Invitation.findOne({
    invitationToken: parsed.token,
  }).populate("household")

  if (!invitation) {
    return {
      status: "not_found",
      message: "Kutsu ei kelpaa tai sitä ei löydy",
    }
  }

  if (!invitation.isValid()) {
    if (invitation.status === "pending" && new Date() > invitation.expiresAt) {
      await invitation.markExpired()
    }
    return {
      status: "bad_request",
      message: "Kutsu on vanhentunut tai virheellinen",
    }
  }

  const household = invitation.household as unknown as IHousehold | null
  if (!household) {
    return { status: "not_found", message: "Perhettä ei löytynyt" }
  }

  if (invitation.email !== user.email.toLowerCase()) {
    return {
      status: "forbidden",
      message: "Kutsu on lähetetty toiselle sähköpostiosoitteelle",
    }
  }

  household.members.push({
    userId: user._id,
    role: "member",
    joinedAt: new Date(),
  })

  await household.save()

  invitation.status = "accepted"
  invitation.acceptedAt = new Date()
  invitation.acceptedBy = user._id
  await invitation.save()

  await User.findByIdAndUpdate(user._id, { household: household._id })
  user.household = household._id
  await shareHouseholdDocuments(household._id)
  await getCanonicalPantry(user)

  const populatedHousehold = await Household.findById(household._id)
    .populate("members.userId", "username email profileImage")
    .populate("owner", "username email profileImage")

  return {
    status: "ok",
    household: populatedHousehold,
    message: "Liityit perheeseen onnistuneesti",
  }
}
