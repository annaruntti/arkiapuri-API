import { check, validationResult } from "express-validator"
import { Request, Response, NextFunction } from "express"
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "../../helpers/passwordPolicy"

export const validateUserSignUp = [
  check("username")
    .trim()
    .not()
    .isEmpty()
    .withMessage("Name is required!")
    .isString()
    .withMessage("Must be a valid name!")
    .isLength({ min: 3, max: 20 })
    .withMessage("Name must be within 3 to 20 character!"),
  check("email").normalizeEmail().isEmail().withMessage("Invalid email!"),
  check("password")
    .trim()
    .not()
    .isEmpty()
    .withMessage("Password is empty!")
    .isLength({ min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH })
    .withMessage(
      `Password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters long!`
    ),
  check("confirmPassword")
    .trim()
    .not()
    .isEmpty()
    .custom((value: string, { req }) => {
      if (value !== req.body.password) {
        throw new Error("Both password must be same!")
      }
      return true
    }),
]

export const userVlidation = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const result = validationResult(req).array()
  if (!result.length) return next()

  const error = result[0].msg
  res.status(400).json({ success: false, message: error })
}

export const validateUserSignIn = [
  check("email").trim().isEmail().withMessage("email / password is required!"),
  check("password")
    .trim()
    .not()
    .isEmpty()
    .withMessage("email / password is required!"),
]
