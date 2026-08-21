import { Router } from "express"
import { isAuth } from "../middlewares/auth"
import {
  createHousehold,
  getHousehold,
  updateHousehold,
  inviteToHousehold,
  leaveHousehold,
  removeMember,
  cancelInvitation,
  updateMemberRole,
  deleteHousehold,
  getInvitationByToken,
  acceptInvitation,
} from "../controllers/household"

const router = Router()

router.post("/household", isAuth, createHousehold)
router.get("/household", isAuth, getHousehold)
router.put("/household", isAuth, updateHousehold)
router.post("/household/invite", isAuth, inviteToHousehold)
router.get("/household/invitation/:token", getInvitationByToken)
router.post("/household/accept-invite", isAuth, acceptInvitation)
router.post("/household/leave", isAuth, leaveHousehold)
router.delete("/household/members/:memberId", isAuth, removeMember)
router.delete("/household/invitations/:invitationId", isAuth, cancelInvitation)
router.put("/household/members/:memberId/role", isAuth, updateMemberRole)
router.delete("/household", isAuth, deleteHousehold)

export default router
