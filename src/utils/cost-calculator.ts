interface MonthlyCosts {
  railway: number
  mongodb: number
  total: number
}

interface CostCalculation {
  freeCosts: MonthlyCosts
  minimumPaidCosts: MonthlyCosts
}

const calculateMonthlyCosts = (): CostCalculation => {
  const freeCosts: MonthlyCosts = {
    railway: 0,
    mongodb: 0,
    total: 0,
  }

  const minimumPaidCosts: MonthlyCosts = {
    railway: 5,
    mongodb: 0,
    total: 5,
  }

  return { freeCosts, minimumPaidCosts }
}

export default calculateMonthlyCosts
