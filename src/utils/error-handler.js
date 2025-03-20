const Sentry = require("@sentry/node")

if (process.env.NODE_ENV === "production") {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  })
}

const errorHandler = (err, req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    Sentry.captureException(err)
  }

  console.error(err)

  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  })
}

module.exports = errorHandler
