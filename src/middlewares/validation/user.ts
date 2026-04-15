import { check, validationResult } from "express-validator"
import { Request, Response, NextFunction } from "express"

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
    .isLength({ min: 8, max: 20 })
    .withMessage("Password must be 3 to 20 characters long!"),
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
  res.json({ success: false, message: error })
}

export const validateUserSignIn = [
  check("email").trim().isEmail().withMessage("email / password is required!"),
  check("password")
    .trim()
    .not()
    .isEmpty()
    .withMessage("email / password is required!"),
]
