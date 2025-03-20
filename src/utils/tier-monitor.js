const checkTierUsage = async (userId) => {
  const usage = await Usage.findOne({
    userId,
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
  })

  const percentageUsed = (usage.requests / PRICING_TIERS.FREE.requests) * 100

  if (percentageUsed > 80) {
    // Send notification to user
    notifyUser(userId, {
      type: "usage_warning",
      message: `You've used ${percentageUsed}% of your free tier limit`,
    })
  }

  return percentageUsed
}
