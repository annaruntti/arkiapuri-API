const SCALING_THRESHOLDS = {
  RAILWAY_TO_AWS: {
    users: 100,
    requests_per_day: 10000,
    storage_needed: "1GB",
  },
  MONGODB_UPGRADE: {
    storage_used: "450MB", // 90% of free tier
    connections: 450, // Close to free tier limit
  },
}
