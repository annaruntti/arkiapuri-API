"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const { createHousehold, getHousehold, updateHousehold, inviteToHousehold, leaveHousehold, removeMember, updateMemberRole, deleteHousehold, getInvitationByToken, acceptInvitation, } = require("../controllers/household");
const router = (0, express_1.Router)();
router.post("/household", auth_1.isAuth, createHousehold);
router.get("/household", auth_1.isAuth, getHousehold);
router.put("/household", auth_1.isAuth, updateHousehold);
router.post("/household/invite", auth_1.isAuth, inviteToHousehold);
router.get("/household/invitation/:token", getInvitationByToken);
router.post("/household/accept-invite", auth_1.isAuth, acceptInvitation);
router.post("/household/leave", auth_1.isAuth, leaveHousehold);
router.delete("/household/members/:memberId", auth_1.isAuth, removeMember);
router.put("/household/members/:memberId/role", auth_1.isAuth, updateMemberRole);
router.delete("/household", auth_1.isAuth, deleteHousehold);
exports.default = router;
//# sourceMappingURL=household.js.map