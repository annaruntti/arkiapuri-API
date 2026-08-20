import mongoose from "mongoose"
import { AiBudget, AiUsage } from "../../models/aiUsage"
import {
  FEATURE_CREDIT_COST,
  FEATURE_ESTIMATED_USD,
  currentUsagePeriod,
  getAiConfig,
} from "./config"
import type { AiFeature, AiOwnerType } from "./types"

export class QuotaExceededError extends Error {
  constructor() {
    super("AI monthly credit quota exceeded")
    this.name = "QuotaExceededError"
  }
}

export class BudgetExceededError extends Error {
  constructor() {
    super("AI monthly budget exceeded")
    this.name = "BudgetExceededError"
  }
}

export const isGlobalBudgetExceeded = async (): Promise<boolean> => {
  const config = getAiConfig()
  const budget = await AiBudget.findOne({ period: currentUsagePeriod() })
  return (budget?.estimatedCostUsd || 0) >= config.monthlyBudgetUsd
}

const ownerFilter = (ownerType: AiOwnerType, ownerId: string) => ({
  ownerType,
  ownerId: new mongoose.Types.ObjectId(ownerId),
  period: currentUsagePeriod(),
})

export const consumeAiCredits = async (params: {
  ownerType: AiOwnerType
  ownerId: string
  feature: AiFeature
  estimatedCostUsd?: number
}): Promise<{ creditsUsed: number; remainingCredits: number }> => {
  const config = getAiConfig()
  const cost = FEATURE_CREDIT_COST[params.feature]
  const estimatedCostUsd =
    params.estimatedCostUsd ?? FEATURE_ESTIMATED_USD[params.feature]
  const filter = ownerFilter(params.ownerType, params.ownerId)

  if (await isGlobalBudgetExceeded()) {
    throw new BudgetExceededError()
  }

  await AiUsage.findOneAndUpdate(
    filter,
    {
      $setOnInsert: {
        ...filter,
        creditsUsed: 0,
        estimatedCostUsd: 0,
        byFeature: {},
      },
    },
    { upsert: true }
  )

  const updated = await AiUsage.findOneAndUpdate(
    {
      ...filter,
      creditsUsed: { $lte: config.monthlyCreditLimit - cost },
    },
    {
      $inc: {
        creditsUsed: cost,
        estimatedCostUsd,
        [`byFeature.${params.feature}`]: 1,
      },
    },
    { new: true }
  )

  if (!updated) {
    throw new QuotaExceededError()
  }

  await AiBudget.findOneAndUpdate(
    { period: currentUsagePeriod() },
    { $inc: { estimatedCostUsd } },
    { upsert: true }
  )

  return {
    creditsUsed: updated.creditsUsed,
    remainingCredits: Math.max(
      0,
      config.monthlyCreditLimit - updated.creditsUsed
    ),
  }
}

export const refundAiCredits = async (params: {
  ownerType: AiOwnerType
  ownerId: string
  feature: AiFeature
  estimatedCostUsd?: number
}): Promise<void> => {
  const cost = FEATURE_CREDIT_COST[params.feature]
  const estimatedCostUsd =
    params.estimatedCostUsd ?? FEATURE_ESTIMATED_USD[params.feature]
  const filter = ownerFilter(params.ownerType, params.ownerId)

  await AiUsage.updateOne(filter, {
    $inc: {
      creditsUsed: -cost,
      estimatedCostUsd: -estimatedCostUsd,
      [`byFeature.${params.feature}`]: -1,
    },
  })
  await AiBudget.updateOne(
    { period: currentUsagePeriod() },
    { $inc: { estimatedCostUsd: -estimatedCostUsd } }
  )
}
