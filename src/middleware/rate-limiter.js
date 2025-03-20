const tierLimits = {
  free: 1000,
  basic: 10000,
  pro: 50000
};

const tierLimiter = (req, res, next) => {
  const userTier = req.user.tier || 'free';
  const monthlyUsage = await UsageTracker.getMonthlyUsage(req.user.id);
  
  if (monthlyUsage > tierLimits[userTier]) {
    return res.status(429).json({
      error: 'Usage limit reached',
      upgrade_url: '/pricing'
    });
  }
  next();
}; 