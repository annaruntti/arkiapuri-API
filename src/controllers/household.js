const Household = require("../models/household")
const User = require("../models/user")
const crypto = require("crypto")

// Generate a unique invitation code
const generateInvitationCode = () => {
  return crypto.randomBytes(16).toString("hex")
}

// Create a new household (automatically done when user signs up)
exports.createHousehold = async (req, res) => {
  try {
    const { name } = req.body
    const userId = req.user._id

    // Check if user already has a household
    if (req.user.household) {
      return res.status(400).json({
        success: false,
        message: "Olet jo osa perhettä",
      })
    }

    // Create new household
    const household = new Household({
      name: name || `${req.user.username}n perhe`,
      owner: userId,
      members: [
        {
          userId: userId,
          role: "owner",
          joinedAt: new Date(),
        },
      ],
    })

    await household.save()

    // Update user's household reference
    await User.findByIdAndUpdate(userId, { household: household._id })

    res.json({
      success: true,
      household,
      message: "Perhe luotu onnistuneesti",
    })
  } catch (error) {
    console.error("Error creating household:", error)
    res.status(500).json({ success: false, error: error.message })
  }
}

// Get household info
exports.getHousehold = async (req, res) => {
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
      .populate("invitations.invitedBy", "username")

    if (!household) {
      // Household doesn't exist but user has reference - clean it up
      await User.findByIdAndUpdate(userId, { household: null })
      return res.json({
        success: true,
        household: null,
        message: "Et ole vielä osa perhettä",
      })
    }

    // Check if user is actually a member
    if (!household.isMember(userId)) {
      // User has reference but is not a member - clean up and return null
      await User.findByIdAndUpdate(userId, { household: null })
      return res.json({
        success: true,
        household: null,
        message: "Et ole vielä osa perhettä",
      })
    }

    res.json({
      success: true,
      household,
    })
  } catch (error) {
    console.error("Error fetching household:", error)
    res.status(500).json({ success: false, error: error.message })
  }
}

// Update household settings
exports.updateHousehold = async (req, res) => {
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

    // Check if user has permission (owner or admin)
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
  } catch (error) {
    console.error("Error updating household:", error)
    res.status(500).json({ success: false, error: error.message })
  }
}

// Invite someone to household
exports.inviteToHousehold = async (req, res) => {
  try {
    const userId = req.user._id
    const { email } = req.body

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Sähköpostiosoite vaaditaan",
      })
    }

    const household = await Household.findById(req.user.household)

    if (!household) {
      return res.status(404).json({
        success: false,
        message: "Perhettä ei löytynyt",
      })
    }

    // Check if user can invite
    if (!household.canInvite(userId)) {
      return res.status(403).json({
        success: false,
        message: "Sinulla ei ole oikeutta kutsua jäseniä",
      })
    }

    // Check if email is already a member
    const existingUser = await User.findOne({ email })
    if (existingUser && household.isMember(existingUser._id)) {
      return res.status(400).json({
        success: false,
        message: "Käyttäjä on jo perheenjäsen",
      })
    }

    // Check if there's already a pending invitation for this email
    const existingInvitation = household.invitations.find(
      (inv) => inv.email === email && inv.status === "pending"
    )

    if (existingInvitation) {
      return res.status(400).json({
        success: false,
        message: "Tällä sähköpostiosoitteella on jo odottava kutsu",
      })
    }

    // Create invitation
    const invitationCode = generateInvitationCode()
    household.invitations.push({
      email,
      invitedBy: userId,
      invitationCode,
      status: "pending",
    })

    await household.save()

    // TODO: Send email with invitation link
    // For now, just return the invitation code

    res.json({
      success: true,
      invitationCode,
      message: `Kutsu lähetetty osoitteeseen ${email}`,
    })
  } catch (error) {
    console.error("Error inviting to household:", error)
    res.status(500).json({ success: false, error: error.message })
  }
}

// Accept invitation and join household
exports.joinHousehold = async (req, res) => {
  try {
    const userId = req.user._id
    const { invitationCode } = req.body

    if (!invitationCode) {
      return res.status(400).json({
        success: false,
        message: "Kutsukoodi vaaditaan",
      })
    }

    // Check if user already has a household
    if (req.user.household) {
      return res.status(400).json({
        success: false,
        message: "Olet jo osa perhettä. Poistu ensin nykyisestä perheestä.",
      })
    }

    // Find household with this invitation
    const household = await Household.findOne({
      "invitations.invitationCode": invitationCode,
    })

    if (!household) {
      return res.status(404).json({
        success: false,
        message: "Kutsu ei kelpaa tai sitä ei löydy",
      })
    }

    // Find the specific invitation
    const invitation = household.invitations.find(
      (inv) => inv.invitationCode === invitationCode
    )

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: "Kutsu ei kelpaa",
      })
    }

    // Check invitation status and expiry
    if (invitation.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Tämä kutsu on jo käytetty tai vanhentunut",
      })
    }

    if (new Date() > invitation.expiresAt) {
      invitation.status = "expired"
      await household.save()
      return res.status(400).json({
        success: false,
        message: "Kutsu on vanhentunut",
      })
    }

    // Check if invitation email matches user email
    if (invitation.email !== req.user.email) {
      return res.status(403).json({
        success: false,
        message: "Tämä kutsu on lähetetty eri sähköpostiosoitteeseen",
      })
    }

    // Add user to household
    household.members.push({
      userId: userId,
      role: "member",
      joinedAt: new Date(),
    })

    // Update invitation status
    invitation.status = "accepted"

    await household.save()

    // Update user's household reference
    await User.findByIdAndUpdate(userId, { household: household._id })

    res.json({
      success: true,
      household,
      message: "Liityit perheeseen onnistuneesti",
    })
  } catch (error) {
    console.error("Error joining household:", error)
    res.status(500).json({ success: false, error: error.message })
  }
}

// Leave household
exports.leaveHousehold = async (req, res) => {
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

    // Check if user is the owner
    if (household.owner.toString() === userId.toString()) {
      return res.status(400).json({
        success: false,
        message:
          "Omistaja ei voi poistua perheestä. Siirrä omistajuus toiselle jäsenelle tai poista perhe.",
      })
    }

    // Remove user from household members
    household.members = household.members.filter(
      (member) => member.userId.toString() !== userId.toString()
    )

    await household.save()

    // Update user's household reference
    await User.findByIdAndUpdate(userId, { household: null })

    res.json({
      success: true,
      message: "Poistuit perheestä onnistuneesti",
    })
  } catch (error) {
    console.error("Error leaving household:", error)
    res.status(500).json({ success: false, error: error.message })
  }
}

// Remove member from household (admin/owner only)
exports.removeMember = async (req, res) => {
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

    // Check if user has permission (owner or admin)
    const role = household.getUserRole(userId)
    if (role !== "owner" && role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Sinulla ei ole oikeutta poistaa jäseniä",
      })
    }

    // Can't remove the owner
    if (household.owner.toString() === memberId) {
      return res.status(400).json({
        success: false,
        message: "Omistajaa ei voi poistaa",
      })
    }

    // Remove member
    household.members = household.members.filter(
      (member) => member.userId.toString() !== memberId
    )

    await household.save()

    // Update user's household reference
    await User.findByIdAndUpdate(memberId, { household: null })

    res.json({
      success: true,
      message: "Jäsen poistettu onnistuneesti",
    })
  } catch (error) {
    console.error("Error removing member:", error)
    res.status(500).json({ success: false, error: error.message })
  }
}

// Update member role (owner only)
exports.updateMemberRole = async (req, res) => {
  try {
    const userId = req.user._id
    const { memberId } = req.params
    const { role } = req.body

    if (!["admin", "member"].includes(role)) {
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

    // Only owner can update roles
    if (household.owner.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Vain omistaja voi muuttaa jäsenten rooleja",
      })
    }

    // Find member
    const member = household.members.find(
      (m) => m.userId.toString() === memberId
    )

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Jäsentä ei löytynyt",
      })
    }

    // Can't change owner's role
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
  } catch (error) {
    console.error("Error updating member role:", error)
    res.status(500).json({ success: false, error: error.message })
  }
}

// Delete household (owner only)
exports.deleteHousehold = async (req, res) => {
  try {
    const userId = req.user._id

    const household = await Household.findById(req.user.household)

    if (!household) {
      return res.status(404).json({
        success: false,
        message: "Perhettä ei löytynyt",
      })
    }

    // Only owner can delete
    if (household.owner.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Vain omistaja voi poistaa perheen",
      })
    }

    // Update all members' household reference
    const memberIds = household.members.map((m) => m.userId)
    await User.updateMany({ _id: { $in: memberIds } }, { household: null })

    // Delete household
    await Household.findByIdAndDelete(household._id)

    res.json({
      success: true,
      message: "Perhe poistettu onnistuneesti",
    })
  } catch (error) {
    console.error("Error deleting household:", error)
    res.status(500).json({ success: false, error: error.message })
  }
}

