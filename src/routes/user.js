const express = require("express")

const router = express.Router()
const {
  createUser,
  userSignIn,
  uploadProfile,
  // uploadGroceryImage,
  signOut,
  getUserProfile,
} = require("../controllers/user")
const { isAuth } = require("../middlewares/auth")
const {
  validateUserSignUp,
  userVlidation,
  validateUserSignIn,
} = require("../middlewares/validation/user")

const User = require("../models/user")

// const sharp = require("sharp")

const multer = require("multer")

const storage = multer.diskStorage({})

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

router.post("/upload-profile", isAuth, uploads.single("profile"), uploadProfile)

router.get("/profile", isAuth, getUserProfile)

// router.post(
//   "/upload-grocery-image",
//   isAuth,
//   uploads.single("grocery-image"),
//   uploadGroceryImage
// )

module.exports = router
