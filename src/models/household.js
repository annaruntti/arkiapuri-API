const mongoose = require("mongoose")

const householdSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      default: "Perhe",
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    members: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        role: {
          type: String,
          enum: ["owner", "admin", "member"],
          default: "member",
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    invitations: [
      {
        email: {
          type: String,
          required: true,
        },
        invitedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        invitationCode: {
          type: String,
          required: true,
        },
        status: {
          type: String,
          enum: ["pending", "accepted", "rejected", "expired"],
          default: "pending",
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        expiresAt: {
          type: Date,
          // Default to 7 days from now
          default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      },
    ],
    settings: {
      allowMemberInvites: {
        type: Boolean,
        default: false, // Only owners/admins can invite by default
      },
      sharedData: {
        meals: {
          type: Boolean,
          default: true,
        },
        shoppingLists: {
          type: Boolean,
          default: true,
        },
        pantry: {
          type: Boolean,
          default: true,
        },
        schedules: {
          type: Boolean,
          default: true,
        },
      },
    },
  },
  {
    timestamps: true,
  }
)

// Method to check if a user is a member of this household
householdSchema.methods.isMember = function (userId) {
  return this.members.some(
    (member) => member.userId.toString() === userId.toString()
  )
}

// Method to get user's role in household
householdSchema.methods.getUserRole = function (userId) {
  const member = this.members.find(
    (m) => m.userId.toString() === userId.toString()
  )
  return member ? member.role : null
}

// Method to check if user can invite others
householdSchema.methods.canInvite = function (userId) {
  const role = this.getUserRole(userId)
  if (role === "owner" || role === "admin") return true
  return this.settings.allowMemberInvites && role === "member"
}

module.exports = mongoose.model("Household", householdSchema)

