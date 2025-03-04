const express = require("express")
const { isAuth } = require("../middlewares/auth")
const { analyzeImage } = require("../controllers/vision")

const router = express.Router()

router.post("/analyze-image", isAuth, analyzeImage)

module.exports = router
