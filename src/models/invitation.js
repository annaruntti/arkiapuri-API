const mongoose = require("mongoose")

const invitationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    household: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Household",
      required: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    invitationToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    invitationCode: {
      type: String,
      // Keep for backward compatibility
      sparse: true,
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
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      index: true,
    },
    acceptedAt: {
      type: Date,
    },
    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
)

// Compound index for efficient queries
invitationSchema.index({ email: 1, household: 1, status: 1 })

// Method to check if invitation is valid
invitationSchema.methods.isValid = function () {
  return this.status === "pending" && new Date() < this.expiresAt
}

// Method to mark as expired
invitationSchema.methods.markExpired = function () {
  this.status = "expired"
  return this.save()
}

module.exports = mongoose.model("Invitation", invitationSchema)
