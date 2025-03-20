const checkRequiredEnv = () => {
  const required = [
    "MONGODB_URI",
    "JWT_SECRET",
    "CORS_ORIGIN",
    "CLOUDINARY_USER_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_KEY_SECRET",
  ]

  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    console.error("\x1b[31m%s\x1b[0m", "Error: Missing environment variables:")
    missing.forEach((key) => {
      console.error("\x1b[33m%s\x1b[0m", `- ${key}`)
    })
    console.error(
      "\x1b[36m%s\x1b[0m",
      "\nMake sure you have a .env file with all required variables."
    )
    process.exit(1)
  }
}

module.exports = checkRequiredEnv
