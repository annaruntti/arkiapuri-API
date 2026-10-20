import { Request, Response } from "express"
import type { IHousehold, HouseholdRole } from "../models/household"
import {
  AuthenticatedRequest,
  getErrorMessage,
} from "../helpers/controllerUtils"
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
import {
  createHouseholdForUser,
  getHouseholdForUser,
  getInvitationByTokenLookup,
  lifecycleStatusCode,
  updateHouseholdForUser,
} from "../services/householdLifecycle"

export const createHousehold = async (
  req: AuthenticatedRequest<
    Record<string, string>,
    unknown,
    { name?: string }
  >,
  res: Response
) => {
  try {
    const result = await createHouseholdForUser(req.user, req.body.name)
    if (result.status !== "ok") {
      return res.status(lifecycleStatusCode(result.status)).json({
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
    console.error("Error creating household:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const getHousehold = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await getHouseholdForUser(req.user)
    if (result.status !== "ok") {
      return res.status(lifecycleStatusCode(result.status)).json({
        success: false,
        message: result.message,
      })
    }
    res.json({
      success: true,
      household: result.household,
      ...(result.message ? { message: result.message } : {}),
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
    const result = await updateHouseholdForUser(req.user, {
      name: req.body.name,
      settings: req.body.settings,
    })
    if (result.status !== "ok") {
      return res.status(lifecycleStatusCode(result.status)).json({
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
    const result = await getInvitationByTokenLookup(req.params.token)
    if (result.status !== "ok") {
      return res.status(lifecycleStatusCode(result.status)).json({
        success: false,
        message: result.message,
      })
    }
    res.json({
      success: true,
      invitation: result.invitation,
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
