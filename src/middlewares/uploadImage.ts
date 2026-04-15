import multer, { FileFilterCallback } from "multer"
import path from "path"
import { Request } from "express"

const storage = multer.diskStorage({
  destination: function (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) {
    const uploadsDir = path.join(__dirname, "../../uploads")
    cb(null, uploadsDir)
  },
  filename: function (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) {
    const ext = path.extname(file.originalname)
    cb(null, `${Date.now()}${ext}`)
  },
})

const imageFileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void => {
  const filetypes = /jpeg|jpg|png|heic|heif/
  const mimetype = filetypes.test(file.mimetype)
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase())

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
