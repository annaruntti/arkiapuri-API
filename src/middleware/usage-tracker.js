const UsageTracker = {
  async trackRequest(userId) {
    try {
      const usage = await Usage.findOneAndUpdate(
        { userId, month: new Date().getMonth() },
        { $inc: { requests: 1 } },
        { upsert: true, new: true }
      )

      return usage.requests <= PRICING_TIERS[user.tier].requests
    } catch (error) {
      console.error("Usage tracking error:", error)
      return true // Fail open
    }
  },
}
