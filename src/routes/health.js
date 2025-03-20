const express = require("express")
const router = express.Router()
const mongoose = require("mongoose")

router.get("/health", async (req, res) => {
  try {
    // Check MongoDB connection
    await mongoose.connection.db.admin().ping()

    res.json({
      status: "healthy",
      service: "arkiapuri-api",
      mongodb: "connected",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
    })
  }
})

module.exports = router
