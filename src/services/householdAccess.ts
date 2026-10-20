import mongoose, { type Model } from "mongoose"
import type { IHousehold } from "../models/household"
import type { IInvitation } from "../models/invitation"
import type { IUserModel } from "../models/user"
import {
  AuthenticatedRequest,
  resolveModule,
} from "../helpers/controllerUtils"
import { resolveHouseholdId } from "../helpers/householdHelpers"

const Household = resolveModule<Model<IHousehold>>(
  require("../models/household")
)
const User = resolveModule<IUserModel>(require("../models/user"))
const Invitation = resolveModule<Model<IInvitation>>(
  require("../models/invitation")
)

export const resolveRefId = (value: unknown): string => {
  if (value == null || value === "") return ""
  if (typeof value === "string") {
    if (
      value === "undefined" ||
      value === "null" ||
      value.startsWith("[object ")
    ) {
      return ""
    }
    return value
  }
  if (value instanceof mongoose.Types.ObjectId) {
    return value.toHexString()
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return value.toString("hex")
  }
  if (ArrayBuffer.isView(value) && value.byteLength === 12) {
    return Buffer.from(
      value.buffer,
      value.byteOffset,
      value.byteLength
    ).toString("hex")
  }
  if (typeof value === "object") {
    const obj = value as { _id?: unknown; toHexString?: () => string }
    if (obj._id != null && obj._id !== value) return resolveRefId(obj._id)
    if (typeof obj.toHexString === "function") return obj.toHexString()
  }
  return ""
}

export const householdIdForUser = (user: AuthenticatedRequest["user"]) =>
  resolveHouseholdId(user) || user.household

export const isListedMember = (
  household: IHousehold,
  userId: unknown
): boolean => {
  const id = resolveRefId(userId)
  if (!id) return false
  if (resolveRefId(household.owner) === id) return true
  return household.members.some(
    (member) => resolveRefId(member.userId) === id
  )
}

export const ensureOwnerInMembers = async (
  household: IHousehold
): Promise<void> => {
  const ownerId = resolveRefId(household.owner)
  if (!ownerId) return
  const inMembers = household.members.some(
    (member) => resolveRefId(member.userId) === ownerId
  )
  if (inMembers) return
  household.members.unshift({
    userId: household.owner,
    role: "owner",
    joinedAt: household.createdAt || new Date(),
  } as IHousehold["members"][number])
  await household.save()
}

export const findHouseholdForUser = async (
  user: AuthenticatedRequest["user"]
): Promise<IHousehold | null> => {
  const userId = user._id
  const pointer = householdIdForUser(user)
  if (pointer) {
    const byPointer = await Household.findById(pointer)
    if (byPointer && isListedMember(byPointer, userId)) {
      return byPointer
    }
    if (byPointer && resolveRefId(byPointer.owner) === resolveRefId(userId)) {
      return byPointer
    }
  }

  const owned = await Household.findOne({ owner: userId })
  if (owned) return owned

  return Household.findOne({ "members.userId": userId })
}

export const restoreUserHouseholdLink = async (
  user: AuthenticatedRequest["user"],
  household: IHousehold
): Promise<void> => {
  const current = resolveRefId(householdIdForUser(user))
  const next = resolveRefId(household._id)
  if (current === next) return
  await User.findByIdAndUpdate(user._id, { household: household._id })
  user.household = household._id
}

export const serializeHouseholdMembers = <
  T extends { members?: Array<{ userId?: unknown }> }
>(
  household: T,
  rawMemberUserIds: string[]
): T => {
  const members = household.members?.map((member, index) => {
    const userId = member.userId
    if (userId && typeof userId === "object" && resolveRefId(userId)) {
      return member
    }
    const fallbackId = rawMemberUserIds[index]
    if (!fallbackId) return member
    return {
      ...member,
      userId: { _id: fallbackId },
    }
  })
  return { ...household, members }
}

export const loadPendingInvitations = async (householdId: unknown) =>
  Invitation.find({
    household: householdId,
    status: "pending",
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .lean()
