import { Router, Request, Response } from "express"
import { isAuth } from "../middlewares/auth"
const {
  createUser,
  userSignIn,
  uploadProfile,
  signOut,
  getUserProfile,
  updateUserProfile,
  deleteUserAccount,
  uploadProfileImage,
} = require("../controllers/user")
import {
  validateUserSignUp,
  userVlidation,
  validateUserSignIn,
} from "../middlewares/validation/user"
import multer from "multer"

const router = Router()

const storage = multer.diskStorage({})

const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (file.mimetype.startsWith("image")) {
    cb(null, true)
  } else {
    cb(new Error("invalid image file!"))
  }
}

const uploads = multer({ storage, fileFilter })

router.post("/create-user", validateUserSignUp, userVlidation, createUser)
router.post("/sign-in", validateUserSignIn, userVlidation, userSignIn)
router.post("/sign-out", isAuth, signOut)
router.post("/upload-profile", isAuth, uploads.single("profile"), uploadProfile)
router.get("/profile", isAuth, getUserProfile)
router.put("/profile", isAuth, updateUserProfile)
router.delete("/profile", isAuth, deleteUserAccount)
router.post("/profile/image", isAuth, uploads.single("profileImage"), uploadProfileImage)

export default router
