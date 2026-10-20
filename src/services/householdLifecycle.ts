import type { Model } from "mongoose"
import type { IHousehold } from "../models/household"
import type { IInvitation } from "../models/invitation"
import type { IUser, IUserModel } from "../models/user"
import { resolveModule } from "../helpers/controllerUtils"
import { shareHouseholdDocuments } from "../helpers/householdHelpers"
import { getCanonicalPantry } from "../helpers/pantryHelpers"
import {
  ensureOwnerInMembers,
  findHouseholdForUser,
  householdIdForUser,
  loadPendingInvitations,
  resolveRefId,
  restoreUserHouseholdLink,
  serializeHouseholdMembers,
} from "./householdAccess"

const Household = resolveModule<Model<IHousehold>>(
  require("../models/household")
)
const User = resolveModule<IUserModel>(require("../models/user"))
const Invitation = resolveModule<Model<IInvitation>>(
  require("../models/invitation")
)

export type HouseholdLifecycleResult =
  | {
      status: "ok"
      message?: string
      household?: IHousehold | null | Record<string, unknown>
      invitation?: Record<string, unknown>
    }
  | {
      status: "bad_request" | "not_found" | "forbidden"
      message: string
    }

export const createHouseholdForUser = async (
  user: IUser,
  name?: string
): Promise<HouseholdLifecycleResult> => {
  if (user.household) {
    return { status: "bad_request", message: "Olet jo osa perhettä" }
  }

  const userId = user._id
  const household = new Household({
    name: name || `${user.username}n perhe`,
    owner: userId,
    members: [
      {
        userId,
        role: "owner",
        joinedAt: new Date(),
      },
    ],
    plan: user.plan === "premium" ? "premium" : "free",
  })

  await household.save()
  await User.findByIdAndUpdate(userId, { household: household._id })
  user.household = household._id
  await shareHouseholdDocuments(household._id)
  await getCanonicalPantry(user)

  const populatedHousehold = await Household.findById(household._id)
    .populate("members.userId", "username email profileImage")
    .populate("owner", "username email profileImage")

  return {
    status: "ok",
    household: populatedHousehold,
    message: "Perhe luotu onnistuneesti",
  }
}

export const getHouseholdForUser = async (
  user: IUser
): Promise<HouseholdLifecycleResult> => {
  const userId = user._id
  const household = await findHouseholdForUser(user)

  if (!household) {
    if (user.household) {
      await User.findByIdAndUpdate(userId, { household: null })
      user.household = null
    }
    return {
      status: "ok",
      household: null,
      message: "Et ole vielä osa perhettä",
    }
  }

  await restoreUserHouseholdLink(user, household)
  await ensureOwnerInMembers(household)

  const rawMemberUserIds = household.members.map((member) =>
    resolveRefId(member.userId)
  )

  await household.populate([
    { path: "members.userId", select: "username email profileImage" },
    { path: "owner", select: "username email profileImage" },
  ])

  const invitations = await loadPendingInvitations(household._id)

  return {
    status: "ok",
    household: {
      ...serializeHouseholdMembers(household.toObject(), rawMemberUserIds),
      invitations,
    },
  }
}

export const updateHouseholdForUser = async (
  user: IUser,
  {
    name,
    settings,
  }: { name?: string; settings?: Partial<IHousehold["settings"]> }
): Promise<HouseholdLifecycleResult> => {
  const userId = user._id
  const household = await Household.findById(householdIdForUser(user))

  if (!household) {
    return { status: "not_found", message: "Perhettä ei löytynyt" }
  }

  const role = household.getUserRole(userId)
  if (role !== "owner" && role !== "admin") {
    return {
      status: "forbidden",
      message: "Sinulla ei ole oikeutta muokata perheen asetuksia",
    }
  }

  if (name) household.name = name
  if (settings) {
    household.settings = { ...household.settings, ...settings }
  }

  await household.save()

  return {
    status: "ok",
    household,
    message: "Perheen tiedot päivitetty onnistuneesti",
  }
}

export const getInvitationByTokenLookup = async (
  token?: string
): Promise<HouseholdLifecycleResult> => {
  if (!token) {
    return { status: "bad_request", message: "Kutsukoodi vaaditaan" }
  }

  const invitation = await Invitation.findOne({ invitationToken: token })
    .populate("household", "name members")
    .populate("invitedBy", "username email")
    .populate({
      path: "household",
      populate: {
        path: "members.userId",
        select: "username email",
      },
    })

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

  return {
    status: "ok",
    invitation: {
      _id: invitation._id,
      email: invitation.email,
      status: invitation.status,
      household: invitation.household,
      invitedBy: invitation.invitedBy,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
    },
  }
}

export const lifecycleStatusCode = (
  status: Exclude<HouseholdLifecycleResult["status"], "ok">
) => {
  if (status === "not_found") return 404
  if (status === "forbidden") return 403
  return 400
}
