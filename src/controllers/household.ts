import { Request, Response } from "express"
import type { Model } from "mongoose"
import type { IHousehold, HouseholdRole } from "../models/household"
import type { IInvitation } from "../models/invitation"
import type { IUserModel } from "../models/user"
import {
  AuthenticatedRequest,
  getErrorMessage,
  resolveModule,
} from "../helpers/controllerUtils"
import { sendFamilyInvitation } from "../services/emailService"

const Household = resolveModule<Model<IHousehold>>(
  require("../models/household")
)
const User = resolveModule<IUserModel>(require("../models/user"))
const Invitation = resolveModule<Model<IInvitation>>(
  require("../models/invitation")
)
const { v4: uuidv4 } = require("uuid") as { v4: () => string }

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
    })

    await household.save()
    await User.findByIdAndUpdate(userId, { household: household._id })

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

    if (!req.user.household) {
      return res.json({
        success: true,
        household: null,
        message: "Et ole vielä osa perhettä",
      })
    }

    const household = await Household.findById(req.user.household)
      .populate("members.userId", "username email profileImage")
      .populate("owner", "username email profileImage")

    if (!household) {
      await User.findByIdAndUpdate(userId, { household: null })
      return res.json({
        success: true,
        household: null,
        message: "Et ole vielä osa perhettä",
      })
    }

    if (!household.isMember(userId)) {
      await User.findByIdAndUpdate(userId, { household: null })
      return res.json({
        success: true,
        household: null,
        message: "Et ole vielä osa perhettä",
      })
    }

    res.json({ success: true, household })
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

    const household = await Household.findById(req.user.household)

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

    const household = await Household.findById(req.user.household).populate(
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

    const household = await Household.findById(req.user.household)

    if (!household) {
      return res.status(404).json({
        success: false,
        message: "Perhettä ei löytynyt",
      })
    }

    if (household.owner.toString() === userId.toString()) {
      return res.status(400).json({
        success: false,
        message:
          "Omistaja ei voi poistua perheestä. Siirrä omistajuus toiselle jäsenelle tai poista perhe.",
      })
    }

    household.members = household.members.filter(
      (member) => member.userId.toString() !== userId.toString()
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

    const household = await Household.findById(req.user.household)

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

    if (household.owner.toString() === memberId) {
      return res.status(400).json({
        success: false,
        message: "Omistajaa ei voi poistaa",
      })
    }

    household.members = household.members.filter(
      (member) => member.userId.toString() !== memberId
    )

    await household.save()
    await User.findByIdAndUpdate(memberId, { household: null })

    res.json({
      success: true,
      message: "Jäsen poistettu onnistuneesti",
    })
  } catch (error: unknown) {
    console.error("Error removing member:", error)
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

    const household = await Household.findById(req.user.household)

    if (!household) {
      return res.status(404).json({
        success: false,
        message: "Perhettä ei löytynyt",
      })
    }

    if (household.owner.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Vain omistaja voi muuttaa jäsenten rooleja",
      })
    }

    const member = household.members.find(
      (m) => m.userId.toString() === memberId
    )

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Jäsentä ei löytynyt",
      })
    }

    if (household.owner.toString() === memberId) {
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
    const household = await Household.findById(req.user.household)

    if (!household) {
      return res.status(404).json({
        success: false,
        message: "Perhettä ei löytynyt",
      })
    }

    if (household.owner.toString() !== userId.toString()) {
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
