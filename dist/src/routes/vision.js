"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const { analyzeImage } = require("../controllers/vision");
const router = (0, express_1.Router)();
router.post("/analyze-image", auth_1.isAuth, analyzeImage);
exports.default = router;
//# sourceMappingURL=vision.js.map