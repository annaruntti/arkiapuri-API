"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateUserSignIn = exports.userVlidation = exports.validateUserSignUp = void 0;
const express_validator_1 = require("express-validator");
exports.validateUserSignUp = [
    (0, express_validator_1.check)("username")
        .trim()
        .not()
        .isEmpty()
        .withMessage("Name is required!")
        .isString()
        .withMessage("Must be a valid name!")
        .isLength({ min: 3, max: 20 })
        .withMessage("Name must be within 3 to 20 character!"),
    (0, express_validator_1.check)("email").normalizeEmail().isEmail().withMessage("Invalid email!"),
    (0, express_validator_1.check)("password")
        .trim()
        .not()
        .isEmpty()
        .withMessage("Password is empty!")
        .isLength({ min: 8, max: 20 })
        .withMessage("Password must be 3 to 20 characters long!"),
    (0, express_validator_1.check)("confirmPassword")
        .trim()
        .not()
        .isEmpty()
        .custom((value, { req }) => {
        if (value !== req.body.password) {
            throw new Error("Both password must be same!");
        }
        return true;
    }),
];
const userVlidation = (req, res, next) => {
    const result = (0, express_validator_1.validationResult)(req).array();
    if (!result.length)
        return next();
    const error = result[0].msg;
    res.json({ success: false, message: error });
};
exports.userVlidation = userVlidation;
exports.validateUserSignIn = [
    (0, express_validator_1.check)("email").trim().isEmail().withMessage("email / password is required!"),
    (0, express_validator_1.check)("password")
        .trim()
        .not()
        .isEmpty()
        .withMessage("email / password is required!"),
];
//# sourceMappingURL=user.js.map