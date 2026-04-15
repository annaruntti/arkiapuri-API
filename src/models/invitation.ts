import mongoose, { Document, Schema } from "mongoose"

export type InvitationStatus = "pending" | "accepted" | "declined" | "expired"

export interface IInvitation extends Document {
  email: string
  household: mongoose.Types.ObjectId
  invitedBy: mongoose.Types.ObjectId
  invitationToken: string
  status: InvitationStatus
  createdAt: Date
  expiresAt: Date
  acceptedAt?: Date
  acceptedBy?: mongoose.Types.ObjectId
  updatedAt: Date
  // Methods
  isValid(): boolean
  markExpired(): Promise<IInvitation>
}

const invitationSchema = new Schema<IInvitation>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    household: {
      type: Schema.Types.ObjectId,
      ref: "Household",
      required: true,
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    invitationToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "expired"],
      default: "pending",
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      index: true,
    },
    acceptedAt: {
      type: Date,
    },
    acceptedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
)

invitationSchema.index({ email: 1, household: 1, status: 1 })

invitationSchema.methods.isValid = function (this: IInvitation): boolean {
  return this.status === "pending" && new Date() < this.expiresAt
}

invitationSchema.methods.markExpired = function (this: IInvitation): Promise<IInvitation> {
  this.status = "expired"
  return this.save()
}

export default mongoose.model<IInvitation>("Invitation", invitationSchema)
