const PRICING_TIERS = {
  FREE: {
    requests: 1000,
    storage: 512, // MB
    features: ["basic_api", "basic_dashboard"],
  },
  BASIC: {
    price: 4.99,
    requests: 10000,
    storage: 1024,
    features: ["advanced_api", "analytics"],
  },
  PRO: {
    price: 9.99,
    requests: 50000,
    storage: 2048,
    features: ["all_features"],
  },
}
