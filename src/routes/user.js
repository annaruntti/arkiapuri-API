const express = require("express")

const router = express.Router()
const {
  createUser,
  userSignIn,
  // uploadProfile,
  // uploadGroceryImage,
  signOut,
} = require("../controllers/user")
const { isAuth } = require("../middlewares/auth")
const {
  validateUserSignUp,
  userVlidation,
  validateUserSignIn,
} = require("../middlewares/validation/user")

const User = require("../models/user")

const sharp = require("sharp")

const multer = require("multer")

const storage = multer.memoryStorage()

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image")) {
    cb(null, true)
  } else {
    cb("invalid image file!", false)
  }
}
const uploads = multer({ storage, fileFilter })

router.post("/create-user", validateUserSignUp, userVlidation, createUser)
router.post("/sign-in", validateUserSignIn, userVlidation, userSignIn)
router.post("/sign-out", isAuth, signOut)

// router.post("/upload-profile", isAuth, uploads.single("profile"), uploadProfile)

router.post(
  "/upload-profile",
  isAuth,
  uploads.single("profile"),
  async (req, res) => {
    const { user } = req
    if (!user)
      return res
        .status(401)
        .json({ success: false, message: "unauthorised access!" })

    try {
      const profileBuffer = req.file.buffer
      const { width, height } = await sharp(profileBuffer).metadata()
      const avatar = await sharp(profileBuffer)
        .resize(Math.round(width * 0.5), Math.round(height * 0.5))
        .toBuffer()

      await User.findByIdAndUpdate(user._id, { avatar })
      res
        .status(201)
        .json({ success: true, message: "Your profile has updated" })
    } catch (error) {
      res
        .status(500)
        .json({ success: false, message: "Server error, try again" })
      console.log("Error while uploading image", error.message)
    }
  }
)

router.post("/create-grocery", isAuth, (req, res) => {
  // continue later
  res.send("you are in secret route now")
})

// router.post(
//   "/upload-grocery-image",
//   isAuth,
//   uploads.single("grocery-image"),
//   uploadGroceryImage
// )

module.exports = router
