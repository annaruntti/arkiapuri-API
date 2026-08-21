import { Router, Request } from "express"
import multer from "multer"
import { isAuth } from "../middlewares/auth"
import { authRateLimiter } from "../middleware/security"
import {
  createUser,
  userSignIn,
  uploadProfile,
  signOut,
  getUserProfile,
  updateUserProfile,
  deleteUserAccount,
  uploadProfileImage,
} from "../controllers/user"
import {
  validateUserSignUp,
  userVlidation,
  validateUserSignIn,
} from "../middlewares/validation/user"

const router = Router()

const storage = multer.diskStorage({})

const fileFilter = (
  _req: Request,
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

router.post(
  "/create-user",
  authRateLimiter,
  validateUserSignUp,
  userVlidation,
  createUser
)
router.post(
  "/sign-in",
  authRateLimiter,
  validateUserSignIn,
  userVlidation,
  userSignIn
)
router.post("/sign-out", isAuth, signOut)
router.post("/upload-profile", isAuth, uploads.single("profile"), uploadProfile)
router.get("/profile", isAuth, getUserProfile)
router.put("/profile", isAuth, updateUserProfile)
router.delete("/profile", isAuth, deleteUserAccount)
router.post("/profile/image", isAuth, uploads.single("profileImage"), uploadProfileImage)

export default router
