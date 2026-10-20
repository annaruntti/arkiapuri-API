import type { Model } from "mongoose"
import type { HouseholdRole, IHousehold } from "../models/household"
import type { IInvitation } from "../models/invitation"
import type { IUser, IUserModel } from "../models/user"
import { resolveModule } from "../helpers/controllerUtils"
import { householdIdForUser, resolveRefId } from "./householdAccess"

const Household = resolveModule<Model<IHousehold>>(
  require("../models/household")
)
const User = resolveModule<IUserModel>(require("../models/user"))
const Invitation = resolveModule<Model<IInvitation>>(
  require("../models/invitation")
)

export type HouseholdMembershipResult =
  | { status: "ok"; message: string; household?: IHousehold | null }
  | {
      status: "bad_request" | "not_found" | "forbidden"
      message: string
    }

export const leaveHouseholdMembership = async (
  user: IUser
): Promise<HouseholdMembershipResult> => {
  const userId = user._id

  if (!user.household) {
    return { status: "bad_request", message: "Et ole osa perhettä" }
  }

  const household = await Household.findById(householdIdForUser(user))
  if (!household) {
    return { status: "not_found", message: "Perhettä ei löytynyt" }
  }

  if (resolveRefId(household.owner) === userId.toString()) {
    return {
      status: "bad_request",
      message:
        "Omistaja ei voi poistua perheestä. Siirrä omistajuus toiselle jäsenelle tai poista perhe.",
    }
  }

  household.members = household.members.filter(
    (member) => resolveRefId(member.userId) !== userId.toString()
  )

  await household.save()
  await User.findByIdAndUpdate(userId, { household: null })

  return { status: "ok", message: "Poistuit perheestä onnistuneesti" }
}

export const removeHouseholdMember = async (
  user: IUser,
  memberId: string
): Promise<HouseholdMembershipResult> => {
  const userId = user._id
  const household = await Household.findById(householdIdForUser(user))

  if (!household) {
    return { status: "not_found", message: "Perhettä ei löytynyt" }
  }

  const role = household.getUserRole(userId)
  if (role !== "owner" && role !== "admin") {
    return {
      status: "forbidden",
      message: "Sinulla ei ole oikeutta poistaa jäseniä",
    }
  }

  const targetId = String(memberId)
  if (!targetId || targetId === "undefined") {
    return { status: "bad_request", message: "Jäsenen tunniste puuttuu" }
  }

  if (resolveRefId(household.owner) === targetId) {
    return { status: "bad_request", message: "Omistajaa ei voi poistaa" }
  }

  const nextMembers = household.members.filter((member) => {
    const memberUserId = resolveRefId(member.userId)
    const memberDocId = resolveRefId((member as { _id?: unknown })._id)
    return memberUserId !== targetId && memberDocId !== targetId
  })

  if (nextMembers.length === household.members.length) {
    return { status: "not_found", message: "Jäsentä ei löytynyt" }
  }

  const removedUserIds = household.members
    .filter((member) => !nextMembers.includes(member))
    .map((member) => resolveRefId(member.userId))
    .filter(Boolean)

  household.members = nextMembers
  await household.save()

  if (removedUserIds.length > 0) {
    await User.updateMany(
      { _id: { $in: removedUserIds } },
      { household: null }
    )
  }

  return { status: "ok", message: "Jäsen poistettu onnistuneesti" }
}

export const cancelHouseholdInvitation = async (
  user: IUser,
  invitationId: string
): Promise<HouseholdMembershipResult> => {
  const userId = user._id
  const household = await Household.findById(householdIdForUser(user))

  if (!household) {
    return { status: "not_found", message: "Perhettä ei löytynyt" }
  }

  const role = household.getUserRole(userId)
  if (role !== "owner" && role !== "admin") {
    return {
      status: "forbidden",
      message: "Sinulla ei ole oikeutta perua kutsuja",
    }
  }

  const invitation = await Invitation.findOne({
    _id: invitationId,
    household: household._id,
  })

  if (!invitation) {
    return { status: "not_found", message: "Kutsua ei löytynyt" }
  }

  if (invitation.status !== "pending") {
    return { status: "bad_request", message: "Kutsu ei ole enää voimassa" }
  }

  await Invitation.deleteOne({ _id: invitation._id })

  return { status: "ok", message: "Kutsu peruttu" }
}

export const updateHouseholdMemberRole = async (
  user: IUser,
  memberId: string,
  role?: HouseholdRole
): Promise<HouseholdMembershipResult> => {
  const userId = user._id

  if (!role || !["admin", "member"].includes(role)) {
    return { status: "bad_request", message: "Virheellinen rooli" }
  }

  const household = await Household.findById(householdIdForUser(user))
  if (!household) {
    return { status: "not_found", message: "Perhettä ei löytynyt" }
  }

  if (resolveRefId(household.owner) !== userId.toString()) {
    return {
      status: "forbidden",
      message: "Vain omistaja voi muuttaa jäsenten rooleja",
    }
  }

  const member = household.members.find(
    (m) => resolveRefId(m.userId) === String(memberId)
  )

  if (!member) {
    return { status: "not_found", message: "Jäsentä ei löytynyt" }
  }

  if (resolveRefId(household.owner) === String(memberId)) {
    return {
      status: "bad_request",
      message: "Omistajan roolia ei voi muuttaa",
    }
  }

  member.role = role
  await household.save()

  return {
    status: "ok",
    household,
    message: "Jäsenen rooli päivitetty onnistuneesti",
  }
}

export const deleteHouseholdMembership = async (
  user: IUser
): Promise<HouseholdMembershipResult> => {
  const userId = user._id
  const household = await Household.findById(householdIdForUser(user))

  if (!household) {
    return { status: "not_found", message: "Perhettä ei löytynyt" }
  }

  if (resolveRefId(household.owner) !== userId.toString()) {
    return {
      status: "forbidden",
      message: "Vain omistaja voi poistaa perheen",
    }
  }

  const memberIds = household.members.map((m) => m.userId)
  await User.updateMany({ _id: { $in: memberIds } }, { household: null })
  await Household.findByIdAndDelete(household._id)

  return { status: "ok", message: "Perhe poistettu onnistuneesti" }
}

export const membershipStatusCode = (
  status: Exclude<HouseholdMembershipResult["status"], "ok">
) => {
  if (status === "not_found") return 404
  if (status === "forbidden") return 403
  return 400
}
