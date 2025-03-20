const Analytics = require("../models/Analytics")

const trackApiUsage = async (req, res, next) => {
  const startTime = Date.now()

  res.on("finish", async () => {
    try {
      await Analytics.create({
        endpoint: req.path,
        method: req.method,
        userId: req.user?.id,
        responseTime: Date.now() - startTime,
        statusCode: res.statusCode,
        timestamp: new Date(),
      })
    } catch (error) {
      console.error("Analytics error:", error)
    }
  })

  next()
}

module.exports = trackApiUsage
