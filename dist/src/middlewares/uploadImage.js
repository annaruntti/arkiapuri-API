"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.foodItemUpload = exports.mealUpload = exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const storage = multer_1.default.diskStorage({
    destination: function (req, file, cb) {
        const uploadsDir = path_1.default.join(__dirname, "../../uploads");
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const ext = path_1.default.extname(file.originalname);
        cb(null, `${Date.now()}${ext}`);
    },
});
const imageFileFilter = (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|heic|heif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path_1.default.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
        cb(null, true);
    }
    else {
        cb(new Error("Only .png, .jpg, .jpeg, .heic and .heif format allowed!"));
    }
};
const uploadLimits = {
    fileSize: 5 * 1024 * 1024, // 5MB
};
exports.upload = (0, multer_1.default)({
    storage,
    limits: uploadLimits,
    fileFilter: imageFileFilter,
}).single("profileImage");
exports.mealUpload = (0, multer_1.default)({
    storage,
    limits: uploadLimits,
    fileFilter: imageFileFilter,
}).single("mealImage");
exports.foodItemUpload = (0, multer_1.default)({
    storage,
    limits: uploadLimits,
    fileFilter: imageFileFilter,
}).single("mealImage");
//# sourceMappingURL=uploadImage.js.map