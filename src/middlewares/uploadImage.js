const multer = require("multer")
const path = require("path")

// Configure multer for image upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Use absolute path to uploads directory
    const uploadsDir = path.join(__dirname, "../../uploads")
    cb(null, uploadsDir)
  },
  filename: function (req, file, cb) {
    // Keep original filename extension
    const ext = path.extname(file.originalname)
    cb(null, `${Date.now()}${ext}`)
  },
})

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|heic|heif/
    const mimetype = filetypes.test(file.mimetype)
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    )

    if (mimetype && extname) {
      return cb(null, true)
    }
    cb(new Error("Only .png, .jpg, .jpeg, .heic and .heif format allowed!"))
  },
})

module.exports = upload
