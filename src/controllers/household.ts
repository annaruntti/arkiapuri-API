import { Request, Response } from "express"
import mongoose, { type Model } from "mongoose"
import type { IHousehold, HouseholdRole } from "../models/household"
import type { IInvitation } from "../models/invitation"
import type { IUserModel } from "../models/user"
import {
  AuthenticatedRequest,
  getErrorMessage,
  resolveModule,
} from "../helpers/controllerUtils"
import { sendFamilyInvitation } from "../services/emailService"
import {
  resolveHouseholdId,
  shareHouseholdDocuments,
} from "../helpers/householdHelpers"
import { getCanonicalPantry } from "../helpers/pantryHelpers"

const Household = resolveModule<Model<IHousehold>>(
  require("../models/household")
)
const User = resolveModule<IUserModel>(require("../models/user"))
const Invitation = resolveModule<Model<IInvitation>>(
  require("../models/invitation")
)
const { v4: uuidv4 } = require("uuid") as { v4: () => string }

const resolveRefId = (value: unknown): string => {
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
  if (
    ArrayBuffer.isView(value) &&
    (value as ArrayLike<number>).length === 12
  ) {
    return Buffer.from(value as Uint8Array).toString("hex")
  }
  if (typeof value === "object") {
    const obj = value as { _id?: unknown; toHexString?: () => string }
    if (obj._id != null && obj._id !== value) return resolveRefId(obj._id)
    if (typeof obj.toHexString === "function") return obj.toHexString()
  }
  return ""
}

const householdIdForUser = (user: AuthenticatedRequest["user"]) =>
  resolveHouseholdId(user) || user.household

const isListedMember = (household: IHousehold, userId: unknown): boolean => {
  const id = resolveRefId(userId)
  if (!id) return false
  if (resolveRefId(household.owner) === id) return true
  return household.members.some(
    (member) => resolveRefId(member.userId) === id
  )
}

const ensureOwnerInMembers = async (household: IHousehold): Promise<void> => {
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

const findHouseholdForUser = async (
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

const restoreUserHouseholdLink = async (
  user: AuthenticatedRequest["user"],
  household: IHousehold
): Promise<void> => {
  const current = resolveRefId(householdIdForUser(user))
  const next = resolveRefId(household._id)
  if (current === next) return
  await User.findByIdAndUpdate(user._id, { household: household._id })
  user.household = household._id
}

const serializeHouseholdMembers = <
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

const loadPendingInvitations = async (householdId: unknown) =>
  Invitation.find({
    household: householdId,
    status: "pending",
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .lean()

export const createHousehold = async (
  req: AuthenticatedRequest<
    Record<string, string>,
    unknown,
    { name?: string }
  >,
  res: Response
) => {
  try {
    const { name } = req.body
    const userId = req.user._id

    if (req.user.household) {
      return res.status(400).json({
        success: false,
        message: "Olet jo osa perhettä",
      })
    }

    const household = new Household({
      name: name || `${req.user.username}n perhe`,
      owner: userId,
      members: [
        {
          userId,
          role: "owner",
          joinedAt: new Date(),
        },
      ],
      plan: req.user.plan === "premium" ? "premium" : "free",
    })

    await household.save()
    await User.findByIdAndUpdate(userId, { household: household._id })
    req.user.household = household._id
    await shareHouseholdDocuments(household._id)
    await getCanonicalPantry(req.user)

    const populatedHousehold = await Household.findById(household._id)
      .populate("members.userId", "username email profileImage")
      .populate("owner", "username email profileImage")

    res.json({
      success: true,
      household: populatedHousehold,
      message: "Perhe luotu onnistuneesti",
    })
  } catch (error: unknown) {
    console.error("Error creating household:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const getHousehold = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user._id
    const household = await findHouseholdForUser(req.user)

    if (!household) {
      if (req.user.household) {
        await User.findByIdAndUpdate(userId, { household: null })
        req.user.household = null
      }
      return res.json({
        success: true,
        household: null,
        message: "Et ole vielä osa perhettä",
      })
    }

    await restoreUserHouseholdLink(req.user, household)
    await ensureOwnerInMembers(household)

    const rawMemberUserIds = household.members.map((member) =>
      resolveRefId(member.userId)
    )

    await household.populate([
      { path: "members.userId", select: "username email profileImage" },
      { path: "owner", select: "username email profileImage" },
    ])

    const invitations = await loadPendingInvitations(household._id)

    res.json({
      success: true,
      household: {
        ...serializeHouseholdMembers(household.toObject(), rawMemberUserIds),
        invitations,
      },
    })
  } catch (error: unknown) {
    console.error("Error fetching household:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const updateHousehold = async (
  req: AuthenticatedRequest<
    Record<string, string>,
    unknown,
    { name?: string; settings?: Partial<IHousehold["settings"]> }
  >,
  res: Response
) => {
  try {
    const userId = req.user._id
    const { name, settings } = req.body

    const household = await Household.findById(householdIdForUser(req.user))

    if (!household) {
      return res.status(404).json({
        success: false,
        message: "Perhettä ei löytynyt",
      })
    }

    const role = household.getUserRole(userId)
    if (role !== "owner" && role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Sinulla ei ole oikeutta muokata perheen asetuksia",
      })
    }

    if (name) household.name = name
    if (settings) {
      household.settings = { ...household.settings, ...settings }
    }

    await household.save()

    res.json({
      success: true,
      household,
      message: "Perheen tiedot päivitetty onnistuneesti",
    })
  } catch (error: unknown) {
    console.error("Error updating household:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const inviteToHousehold = async (
  req: AuthenticatedRequest<
    Record<string, string>,
    unknown,
    { email?: string }
  >,
  res: Response
) => {
  try {
    const userId = req.user._id
    const { email } = req.body

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Sähköpostiosoite vaaditaan",
      })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Virheellinen sähköpostiosoite",
      })
    }

    const household = await Household.findById(householdIdForUser(req.user)).populate(
      "owner",
      "username email"
    )

    if (!household) {
      return res.status(404).json({
        success: false,
        message: "Perhettä ei löytynyt",
      })
    }

    if (!household.canInvite(userId)) {
      return res.status(403).json({
        success: false,
        message: "Sinulla ei ole oikeutta kutsua jäseniä",
      })
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() })
    if (existingUser && household.isMember(existingUser._id)) {
      return res.status(400).json({
        success: false,
        message: "Käyttäjä on jo perheenjäsen",
      })
    }

    const existingInvitation = await Invitation.findOne({
      email: email.toLowerCase(),
      household: household._id,
      status: "pending",
      expiresAt: { $gt: new Date() },
    })

    if (existingInvitation) {
      return res.status(400).json({
        success: false,
        message: "Tällä sähköpostiosoitteella on jo odottava kutsu",
      })
    }

    const invitationToken = uuidv4()
    const invitation = new Invitation({
      email: email.toLowerCase(),
      household: household._id,
      invitedBy: userId,
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
      inviterName: req.user.username || req.user.email,
      householdName: household.name,
      inviteLink,
      webInviteLink,
      invitationToken,
    })

    if (!emailResult.success) {
      console.error("Failed to send invitation email:", emailResult.error)
      return res.status(500).json({
        success: false,
        message: `Kutsun luonti epäonnistui: sähköpostin lähetys epäonnistui (${
          emailResult.error || "unknown error"
        })`,
        inviteLink,
      })
    }

    res.json({
      success: true,
      message: `Kutsusähköposti lähetetty osoitteeseen ${email}`,
    })
  } catch (error: unknown) {
    console.error("Error inviting to household:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const leaveHousehold = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user._id

    if (!req.user.household) {
      return res.status(400).json({
        success: false,
        message: "Et ole osa perhettä",
      })
    }

    const household = await Household.findById(householdIdForUser(req.user))

    if (!household) {
      return res.status(404).json({
        success: false,
        message: "Perhettä ei löytynyt",
      })
    }

    if (resolveRefId(household.owner) === userId.toString()) {
      return res.status(400).json({
        success: false,
        message:
          "Omistaja ei voi poistua perheestä. Siirrä omistajuus toiselle jäsenelle tai poista perhe.",
      })
    }

    household.members = household.members.filter(
      (member) => resolveRefId(member.userId) !== userId.toString()
    )

    await household.save()
    await User.findByIdAndUpdate(userId, { household: null })

    res.json({
      success: true,
      message: "Poistuit perheestä onnistuneesti",
    })
  } catch (error: unknown) {
    console.error("Error leaving household:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const removeMember = async (
  req: AuthenticatedRequest<{ memberId: string }>,
  res: Response
) => {
  try {
    const userId = req.user._id
    const { memberId } = req.params

    const household = await Household.findById(householdIdForUser(req.user))

    if (!household) {
      return res.status(404).json({
        success: false,
        message: "Perhettä ei löytynyt",
      })
    }

    const role = household.getUserRole(userId)
    if (role !== "owner" && role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Sinulla ei ole oikeutta poistaa jäseniä",
      })
    }

    const targetId = String(memberId)
    if (!targetId || targetId === "undefined") {
      return res.status(400).json({
        success: false,
        message: "Jäsenen tunniste puuttuu",
      })
    }

    if (resolveRefId(household.owner) === targetId) {
      return res.status(400).json({
        success: false,
        message: "Omistajaa ei voi poistaa",
      })
    }

    const nextMembers = household.members.filter((member) => {
      const memberUserId = resolveRefId(member.userId)
      const memberDocId = resolveRefId(
        (member as { _id?: unknown })._id
      )
      return memberUserId !== targetId && memberDocId !== targetId
    })

    if (nextMembers.length === household.members.length) {
      return res.status(404).json({
        success: false,
        message: "Jäsentä ei löytynyt",
      })
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

    res.json({
      success: true,
      message: "Jäsen poistettu onnistuneesti",
    })
  } catch (error: unknown) {
    console.error("Error removing member:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const cancelInvitation = async (
  req: AuthenticatedRequest<{ invitationId: string }>,
  res: Response
) => {
  try {
    const userId = req.user._id
    const { invitationId } = req.params
    const household = await Household.findById(householdIdForUser(req.user))

    if (!household) {
      return res.status(404).json({
        success: false,
        message: "Perhettä ei löytynyt",
      })
    }

    const role = household.getUserRole(userId)
    if (role !== "owner" && role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Sinulla ei ole oikeutta perua kutsuja",
      })
    }

    const invitation = await Invitation.findOne({
      _id: invitationId,
      household: household._id,
    })

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: "Kutsua ei löytynyt",
      })
    }

    if (invitation.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Kutsu ei ole enää voimassa",
      })
    }

    await Invitation.deleteOne({ _id: invitation._id })

    res.json({
      success: true,
      message: "Kutsu peruttu",
    })
  } catch (error: unknown) {
    console.error("Error cancelling invitation:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const updateMemberRole = async (
  req: AuthenticatedRequest<
    { memberId: string },
    unknown,
    { role?: HouseholdRole }
  >,
  res: Response
) => {
  try {
    const userId = req.user._id
    const { memberId } = req.params
    const { role } = req.body

    if (!role || !["admin", "member"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Virheellinen rooli",
      })
    }

    const household = await Household.findById(householdIdForUser(req.user))

    if (!household) {
      return res.status(404).json({
        success: false,
        message: "Perhettä ei löytynyt",
      })
    }

    if (resolveRefId(household.owner) !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Vain omistaja voi muuttaa jäsenten rooleja",
      })
    }

    const member = household.members.find(
      (m) => resolveRefId(m.userId) === String(memberId)
    )

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Jäsentä ei löytynyt",
      })
    }

    if (resolveRefId(household.owner) === String(memberId)) {
      return res.status(400).json({
        success: false,
        message: "Omistajan roolia ei voi muuttaa",
      })
    }

    member.role = role
    await household.save()

    res.json({
      success: true,
      household,
      message: "Jäsenen rooli päivitetty onnistuneesti",
    })
  } catch (error: unknown) {
    console.error("Error updating member role:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const deleteHousehold = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user._id
    const household = await Household.findById(householdIdForUser(req.user))

    if (!household) {
      return res.status(404).json({
        success: false,
        message: "Perhettä ei löytynyt",
      })
    }

    if (resolveRefId(household.owner) !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Vain omistaja voi poistaa perheen",
      })
    }

    const memberIds = household.members.map((m) => m.userId)
    await User.updateMany({ _id: { $in: memberIds } }, { household: null })
    await Household.findByIdAndDelete(household._id)

    res.json({
      success: true,
      message: "Perhe poistettu onnistuneesti",
    })
  } catch (error: unknown) {
    console.error("Error deleting household:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const getInvitationByToken = async (
  req: Request<{ token: string }>,
  res: Response
) => {
  try {
    const { token } = req.params

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Kutsukoodi vaaditaan",
      })
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
      return res.status(404).json({
        success: false,
        message: "Kutsu ei kelpaa tai sitä ei löydy",
      })
    }

    if (!invitation.isValid()) {
      if (invitation.status === "pending" && new Date() > invitation.expiresAt) {
        await invitation.markExpired()
      }

      return res.status(400).json({
        success: false,
        message: "Kutsu on vanhentunut tai virheellinen",
      })
    }

    res.json({
      success: true,
      invitation: {
        _id: invitation._id,
        email: invitation.email,
        status: invitation.status,
        household: invitation.household,
        invitedBy: invitation.invitedBy,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
      },
    })
  } catch (error: unknown) {
    console.error("Error fetching invitation:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const acceptInvitation = async (
  req: AuthenticatedRequest<
    Record<string, string>,
    unknown,
    { invitationToken?: string }
  >,
  res: Response
) => {
  try {
    const userId = req.user._id
    const { invitationToken } = req.body

    if (!invitationToken) {
      return res.status(400).json({
        success: false,
        message: "Kutsukoodi vaaditaan",
      })
    }

    if (req.user.household) {
      return res.status(400).json({
        success: false,
        message: "Olet jo osa perhettä. Poistu ensin nykyisestä perheestä.",
      })
    }

    const invitation = await Invitation.findOne({
      invitationToken,
    }).populate("household")

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: "Kutsu ei kelpaa tai sitä ei löydy",
      })
    }

    if (!invitation.isValid()) {
      if (invitation.status === "pending" && new Date() > invitation.expiresAt) {
        await invitation.markExpired()
      }

      return res.status(400).json({
        success: false,
        message: "Kutsu on vanhentunut tai virheellinen",
      })
    }

    const household = invitation.household as unknown as IHousehold | null

    if (!household) {
      return res.status(404).json({
        success: false,
        message: "Perhettä ei löytynyt",
      })
    }

    if (invitation.email !== req.user.email.toLowerCase()) {
      console.warn(
        `User ${req.user.email} accepting invitation for ${invitation.email}`
      )
    }

    household.members.push({
      userId,
      role: "member",
      joinedAt: new Date(),
    })

    await household.save()

    invitation.status = "accepted"
    invitation.acceptedAt = new Date()
    invitation.acceptedBy = userId
    await invitation.save()

    await User.findByIdAndUpdate(userId, { household: household._id })
    req.user.household = household._id
    await shareHouseholdDocuments(household._id)
    await getCanonicalPantry(req.user)

    const populatedHousehold = await Household.findById(household._id)
      .populate("members.userId", "username email profileImage")
      .populate("owner", "username email profileImage")

    res.json({
      success: true,
      household: populatedHousehold,
      message: "Liityit perheeseen onnistuneesti",
    })
  } catch (error: unknown) {
    console.error("Error accepting invitation:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}
