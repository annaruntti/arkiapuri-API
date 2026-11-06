import { Router } from "express"
import { isAuth } from "../middleware/auth"
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
} from "../middleware/validation/user"
import { profileUpload } from "../middleware/uploadImage"

const router = Router()

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
router.post(
  "/upload-profile",
  isAuth,
  profileUpload.single("profile"),
  uploadProfile
)
router.get("/profile", isAuth, getUserProfile)
router.put("/profile", isAuth, updateUserProfile)
router.delete("/profile", isAuth, deleteUserAccount)
router.post(
  "/profile/image",
  isAuth,
  profileUpload.single("profileImage"),
  uploadProfileImage
)

export default router
