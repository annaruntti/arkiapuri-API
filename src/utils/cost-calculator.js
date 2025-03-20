const calculateMonthlyCosts = () => {
  // Free tier costs
  const freeCosts = {
    railway: 0,
    mongodb: 0,
    total: 0,
  }

  // Minimum paid tier costs
  const minimumPaidCosts = {
    railway: 5,
    mongodb: 0, // Still on free tier
    total: 5,
  }

  return { freeCosts, minimumPaidCosts }
}
