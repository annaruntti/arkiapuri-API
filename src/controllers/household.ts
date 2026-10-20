import { Request, Response } from "express"
import { type Model } from "mongoose"
import type { IHousehold, HouseholdRole } from "../models/household"
import type { IInvitation } from "../models/invitation"
import type { IUserModel } from "../models/user"
import {
  AuthenticatedRequest,
  getErrorMessage,
  resolveModule,
} from "../helpers/controllerUtils"
import {
  resolveHouseholdId,
  shareHouseholdDocuments,
} from "../helpers/householdHelpers"
import { getCanonicalPantry } from "../helpers/pantryHelpers"
import {
  ensureOwnerInMembers,
  findHouseholdForUser,
  householdIdForUser,
  isListedMember,
  loadPendingInvitations,
  resolveRefId,
  restoreUserHouseholdLink,
  serializeHouseholdMembers,
} from "../services/householdAccess"
import {
  acceptHouseholdInvitation,
  inviteUserToHousehold,
} from "../services/householdInvite"
import {
  cancelHouseholdInvitation,
  deleteHouseholdMembership,
  leaveHouseholdMembership,
  membershipStatusCode,
  removeHouseholdMember,
  updateHouseholdMemberRole,
} from "../services/householdMembership"

const Household = resolveModule<Model<IHousehold>>(
  require("../models/household")
)
const User = resolveModule<IUserModel>(require("../models/user"))
const Invitation = resolveModule<Model<IInvitation>>(
  require("../models/invitation")
)
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
    const result = await inviteUserToHousehold(req.user, req.body.email)
    if (result.status === "ok") {
      return res.json({ success: true, message: result.message })
    }

    const statusCode =
      result.status === "not_found"
        ? 404
        : result.status === "forbidden"
          ? 403
          : result.status === "server_error"
            ? 500
            : 400

    return res.status(statusCode).json({
      success: false,
      message: result.message,
      ...(result.inviteLink ? { inviteLink: result.inviteLink } : {}),
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
    const result = await leaveHouseholdMembership(req.user)
    if (result.status !== "ok") {
      return res.status(membershipStatusCode(result.status)).json({
        success: false,
        message: result.message,
      })
    }
    res.json({ success: true, message: result.message })
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
    const result = await removeHouseholdMember(req.user, req.params.memberId)
    if (result.status !== "ok") {
      return res.status(membershipStatusCode(result.status)).json({
        success: false,
        message: result.message,
      })
    }
    res.json({ success: true, message: result.message })
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
    const result = await cancelHouseholdInvitation(
      req.user,
      req.params.invitationId
    )
    if (result.status !== "ok") {
      return res.status(membershipStatusCode(result.status)).json({
        success: false,
        message: result.message,
      })
    }
    res.json({ success: true, message: result.message })
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
    const result = await updateHouseholdMemberRole(
      req.user,
      req.params.memberId,
      req.body.role
    )
    if (result.status !== "ok") {
      return res.status(membershipStatusCode(result.status)).json({
        success: false,
        message: result.message,
      })
    }
    res.json({
      success: true,
      household: result.household,
      message: result.message,
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
    const result = await deleteHouseholdMembership(req.user)
    if (result.status !== "ok") {
      return res.status(membershipStatusCode(result.status)).json({
        success: false,
        message: result.message,
      })
    }
    res.json({ success: true, message: result.message })
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
    const result = await acceptHouseholdInvitation(
      req.user,
      req.body.invitationToken
    )

    if (result.status !== "ok") {
      const statusCode = result.status === "not_found" ? 404 : 400
      return res.status(statusCode).json({
        success: false,
        message: result.message,
      })
    }

    res.json({
      success: true,
      household: result.household,
      message: result.message,
    })
  } catch (error: unknown) {
    console.error("Error accepting invitation:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}
