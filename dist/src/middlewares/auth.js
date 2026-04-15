"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const user_1 = __importDefault(require("../models/user"));
const isAuth = async (req, res, next) => {
    if (req.headers && req.headers.authorization) {
        const token = req.headers.authorization.split(" ")[1];
        try {
            const decode = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
            const user = await user_1.default.findById(decode.userId).populate("household");
            if (!user) {
                res.json({ success: false, message: "unauthorized access!" });
                return;
            }
            req.user = user;
            next();
        }
        catch (error) {
            if (error.name === "JsonWebTokenError") {
                res.json({ success: false, message: "unauthorized access!" });
                return;
            }
            if (error.name === "TokenExpiredError") {
                res.json({
                    success: false,
                    message: "sesson expired try sign in!",
                });
                return;
            }
            res.json({ success: false, message: "Internal server error!" });
        }
    }
    else {
        res.json({ success: false, message: "unauthorized access!" });
    }
};
exports.isAuth = isAuth;
//# sourceMappingURL=auth.js.map