import { Router } from "express"
import { isAuth } from "../middlewares/auth"
import { analyzeImage } from "../controllers/vision"

const router = Router()

router.post("/analyze-image", isAuth, analyzeImage)

export default router
