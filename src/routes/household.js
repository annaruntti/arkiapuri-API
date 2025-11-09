const express = require("express")
const { isAuth } = require("../middlewares/auth")
const {
  createHousehold,
  getHousehold,
  updateHousehold,
  inviteToHousehold,
  joinHousehold,
  leaveHousehold,
  removeMember,
  updateMemberRole,
  deleteHousehold,
  getInvitationByToken,
  acceptInvitation,
} = require("../controllers/household")

const router = express.Router()

// Create a new household
router.post("/household", isAuth, createHousehold)

// Get household info
router.get("/household", isAuth, getHousehold)

// Update household settings
router.put("/household", isAuth, updateHousehold)

// Invite someone to household (sends email)
router.post("/household/invite", isAuth, inviteToHousehold)

// Get invitation details by token (no auth required - token validates request)
router.get("/household/invitation/:token", getInvitationByToken)

// Accept invitation using token
router.post("/household/accept-invite", isAuth, acceptInvitation)

// Join household with invitation code (legacy support)
router.post("/household/join", isAuth, joinHousehold)

// Leave household
router.post("/household/leave", isAuth, leaveHousehold)

// Remove member from household
router.delete("/household/members/:memberId", isAuth, removeMember)

// Update member role
router.put("/household/members/:memberId/role", isAuth, updateMemberRole)

// Delete household
router.delete("/household", isAuth, deleteHousehold)

module.exports = router

