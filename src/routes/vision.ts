import { Router } from "express"
import { isAuth } from "../middlewares/auth"
const { analyzeImage } = require("../controllers/vision")

const router = Router()

router.post("/analyze-image", isAuth, analyzeImage)

export default router
