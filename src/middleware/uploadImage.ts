import crypto from "crypto"
import fs from "fs"
import multer, { FileFilterCallback } from "multer"
import path from "path"
import { NextFunction, Request, Response } from "express"
import { assertImageMagicBytes } from "../helpers/imageMagic"

const storage = multer.diskStorage({
  destination: function (
    _req: Request,
    _file: Express.Multer.File,
    cb: (error: Error | null, destination: string) => void
  ) {
    const uploadsDir = path.join(__dirname, "../../uploads")
    cb(null, uploadsDir)
  },
  filename: function (
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, filename: string) => void
  ) {
    const ext = path.extname(file.originalname).toLowerCase()
    const safeExt = /^\.(jpe?g|png|heic|heif)$/.test(ext) ? ext : ".jpg"
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safeExt}`)
  },
})

const imageFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void => {
  const allowedExt = /^\.(jpe?g|png|heic|heif)$/i
  const allowedMime =
    /^(image\/jpeg|image\/jpg|image\/png|image\/heic|image\/heif)$/i
  const mimetype = allowedMime.test(file.mimetype)
  const extname = allowedExt.test(path.extname(file.originalname))

  if (mimetype && extname) {
    cb(null, true)
  } else {
    cb(new Error("Only .png, .jpg, .jpeg, .heic and .heif format allowed!"))
  }
}

const uploadLimits = {
  fileSize: 5 * 1024 * 1024, // 5MB
}

export const upload = multer({
  storage,
  limits: uploadLimits,
  fileFilter: imageFileFilter,
}).single("profileImage")

export const mealUpload = multer({
  storage,
  limits: uploadLimits,
  fileFilter: imageFileFilter,
}).single("mealImage")

export const foodItemUpload = multer({
  storage,
  limits: uploadLimits,
  fileFilter: imageFileFilter,
}).single("mealImage")

export const profileUpload = multer({
  storage,
  limits: uploadLimits,
  fileFilter: imageFileFilter,
})

/** After multer: verify magic bytes and delete the temp file on mismatch. */
export const requireImageMagicBytes = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.file?.path) {
    next()
    return
  }

  try {
    assertImageMagicBytes(req.file.path)
    next()
  } catch (error: unknown) {
    try {
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path)
      }
    } catch {
      // ignore cleanup errors
    }
    const message =
      error instanceof Error ? error.message : "Invalid image upload"
    res.status(400).json({ success: false, message })
  }
}
