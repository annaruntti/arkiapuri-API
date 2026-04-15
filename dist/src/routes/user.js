"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const { createUser, userSignIn, uploadProfile, signOut, getUserProfile, updateUserProfile, deleteUserAccount, uploadProfileImage, } = require("../controllers/user");
const user_1 = require("../middlewares/validation/user");
const multer_1 = __importDefault(require("multer"));
const router = (0, express_1.Router)();
const storage = multer_1.default.diskStorage({});
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith("image")) {
        cb(null, true);
    }
    else {
        cb(new Error("invalid image file!"));
    }
};
const uploads = (0, multer_1.default)({ storage, fileFilter });
router.post("/create-user", user_1.validateUserSignUp, user_1.userVlidation, createUser);
router.post("/sign-in", user_1.validateUserSignIn, user_1.userVlidation, userSignIn);
router.post("/sign-out", auth_1.isAuth, signOut);
router.post("/upload-profile", auth_1.isAuth, uploads.single("profile"), uploadProfile);
router.get("/profile", auth_1.isAuth, getUserProfile);
router.put("/profile", auth_1.isAuth, updateUserProfile);
router.delete("/profile", auth_1.isAuth, deleteUserAccount);
router.post("/profile/image", auth_1.isAuth, uploads.single("profileImage"), uploadProfileImage);
exports.default = router;
//# sourceMappingURL=user.js.map