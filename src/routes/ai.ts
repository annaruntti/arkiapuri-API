import { Router } from "express"
import { isAuth } from "../middlewares/auth"
import { requireAiAccess } from "../middlewares/requireAiAccess"
import { getAiStatus, scanPantry } from "../controllers/aiPantryScan"

const router = Router()

router.get("/ai/entitlement", isAuth, getAiStatus)
router.post("/ai/pantry-scan", isAuth, requireAiAccess("pantry_scan"), scanPantry)

export default router
