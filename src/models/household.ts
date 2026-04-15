import mongoose, { Document, Schema } from "mongoose"

export type HouseholdRole = "owner" | "admin" | "member"

export interface IHouseholdMember {
  userId: mongoose.Types.ObjectId
  role: HouseholdRole
  joinedAt: Date
}

export interface IHouseholdSettings {
  allowMemberInvites: boolean
  sharedData: {
    meals: boolean
    shoppingLists: boolean
    pantry: boolean
    schedules: boolean
  }
}

export interface IHousehold extends Document {
  name: string
  owner: mongoose.Types.ObjectId
  members: IHouseholdMember[]
  settings: IHouseholdSettings
  createdAt: Date
  updatedAt: Date
  // Methods
  isMember(userId: mongoose.Types.ObjectId | string): boolean
  getUserRole(userId: mongoose.Types.ObjectId | string): HouseholdRole | null
  canInvite(userId: mongoose.Types.ObjectId | string): boolean
}

const householdSchema = new Schema<IHousehold>(
  {
    name: {
      type: String,
      required: true,
      default: "Perhe",
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    members: [
      {
        userId: {
          type: Schema.Types.ObjectId,
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
        default: false,
      },
      sharedData: {
        meals: { type: Boolean, default: true },
        shoppingLists: { type: Boolean, default: true },
        pantry: { type: Boolean, default: true },
        schedules: { type: Boolean, default: true },
      },
    },
  },
  {
    timestamps: true,
  }
)

householdSchema.methods.isMember = function (
  this: IHousehold,
  userId: mongoose.Types.ObjectId | string
): boolean {
  return this.members.some((member) => {
    if (!member.userId) return false
    const memberId = (member.userId as any)._id || member.userId
    return memberId && memberId.toString() === userId.toString()
  })
}

householdSchema.methods.getUserRole = function (
  this: IHousehold,
  userId: mongoose.Types.ObjectId | string
): HouseholdRole | null {
  const member = this.members.find((m) => {
    if (!m.userId) return false
    const memberId = (m.userId as any)._id || m.userId
    return memberId && memberId.toString() === userId.toString()
  })
  return member ? member.role : null
}

householdSchema.methods.canInvite = function (
  this: IHousehold,
  userId: mongoose.Types.ObjectId | string
): boolean {
  const role = this.getUserRole(userId)
  if (role === "owner" || role === "admin") return true
  return this.settings.allowMemberInvites && role === "member"
}

export default mongoose.model<IHousehold>("Household", householdSchema)
