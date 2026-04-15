import mongoose, { Document, Schema } from "mongoose"

export interface IUsage extends Document {
  userId: mongoose.Types.ObjectId
  month: number
  year: number
  requests: number
  lastRequest: Date
}

const usageSchema = new Schema<IUsage>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  month: {
    type: Number,
    required: true,
  },
  year: {
    type: Number,
    required: true,
  },
  requests: {
    type: Number,
    default: 0,
  },
  lastRequest: {
    type: Date,
    default: Date.now,
  },
})

export default mongoose.model<IUsage>("Usage", usageSchema)
