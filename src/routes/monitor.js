const express = require("express")
const router = express.Router()

router.get("/monitor", async (req, res) => {
  const stats = {
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    mongoConnected: mongoose.connection.readyState === 1,
    timestamp: new Date().toISOString(),
  }

  res.json(stats)
})

module.exports = router
