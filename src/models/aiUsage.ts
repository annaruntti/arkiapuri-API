import mongoose, { Document, Model, Schema } from "mongoose"
import type { AiFeature, AiOwnerType } from "../services/ai/types"

export interface IAiUsage extends Document {
  ownerType: AiOwnerType
  ownerId: mongoose.Types.ObjectId
  period: string
  creditsUsed: number
  estimatedCostUsd: number
  byFeature: Record<string, number>
  createdAt: Date
  updatedAt: Date
}

const aiUsageSchema = new Schema<IAiUsage>(
  {
    ownerType: {
      type: String,
      enum: ["household", "user"],
      required: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    period: {
      type: String,
      required: true,
    },
    creditsUsed: {
      type: Number,
      default: 0,
      min: 0,
    },
    estimatedCostUsd: {
      type: Number,
      default: 0,
      min: 0,
    },
    byFeature: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
)

aiUsageSchema.index({ ownerType: 1, ownerId: 1, period: 1 }, { unique: true })

export interface IAiBudget extends Document {
  period: string
  estimatedCostUsd: number
  updatedAt: Date
}

const aiBudgetSchema = new Schema<IAiBudget>(
  {
    period: { type: String, required: true, unique: true },
    estimatedCostUsd: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
)

export const AiUsage: Model<IAiUsage> =
  mongoose.models.AiUsage || mongoose.model<IAiUsage>("AiUsage", aiUsageSchema)

export const AiBudget: Model<IAiBudget> =
  mongoose.models.AiBudget || mongoose.model<IAiBudget>("AiBudget", aiBudgetSchema)

export type { AiFeature }
