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
  return this.members.some((member) => {
    if (!member.userId) return false;
    // Handle both populated and unpopulated userId
    const memberId = member.userId._id || member.userId;
    return memberId && memberId.toString() === userId.toString();
  });
}

// Method to get user's role in household
householdSchema.methods.getUserRole = function (userId) {
  const member = this.members.find((m) => {
    if (!m.userId) return false;
    // Handle both populated and unpopulated userId
    const memberId = m.userId._id || m.userId;
    return memberId && memberId.toString() === userId.toString();
  });
  return member ? member.role : null;
}

// Method to check if user can invite others
householdSchema.methods.canInvite = function (userId) {
  const role = this.getUserRole(userId)
  if (role === "owner" || role === "admin") return true
  return this.settings.allowMemberInvites && role === "member"
}

module.exports = mongoose.model("Household", householdSchema)

