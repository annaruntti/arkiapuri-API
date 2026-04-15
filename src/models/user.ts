import mongoose, { Document, Model, Schema } from "mongoose"

export interface IUser extends Document {
  username?: string
  name?: string
  email: string
  password?: string
  avatar?: string
  profilePicture?: string
  googleId?: string
  facebookId?: string
  appleId?: string
  isEmailVerified: boolean
  foodItems: mongoose.Types.ObjectId[]
  meals: mongoose.Types.ObjectId[]
  profileImage?: {
    url?: string
    publicId?: string
  }
  resetPasswordToken?: string
  resetPasswordExpiry?: Date
  household?: mongoose.Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
  // Methods
  comparePassword(password: string): Promise<boolean>
}

export interface IUserModel extends Model<IUser> {
  isThisEmailInUse(email: string): Promise<boolean>
}

import bcrypt from "bcrypt"

const userSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: function (this: IUser) {
        return !this.googleId && !this.facebookId && !this.appleId
      },
    },
    name: {
      type: String,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: function (this: IUser) {
        return !this.googleId && !this.facebookId && !this.appleId
      },
    },
    avatar: String,
    profilePicture: String,
    googleId: String,
    facebookId: String,
    appleId: String,
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    foodItems: [
      {
        type: Schema.Types.ObjectId,
        ref: "FoodItem",
      },
    ],
    meals: [
      {
        type: Schema.Types.ObjectId,
        ref: "Meal",
      },
    ],
    profileImage: {
      url: String,
      publicId: String,
    },
    resetPasswordToken: String,
    resetPasswordExpiry: Date,
    household: {
      type: Schema.Types.ObjectId,
      ref: "Household",
      default: null,
    },
  },
  {
    timestamps: true,
  }
)

userSchema.pre("save", function (next) {
  if (this.isModified("password") && this.password) {
    bcrypt.hash(this.password, 8, (err, hash) => {
      if (err) return next(err)
      this.password = hash
      next()
    })
  } else {
    next()
  }
})

userSchema.methods.comparePassword = async function (password: string): Promise<boolean> {
  if (!password) throw new Error("Password is missing")
  try {
    const result = await bcrypt.compare(password, this.password)
    return result
  } catch (error: any) {
    console.log("Error while comparing password!", error.message)
    return false
  }
}

userSchema.statics.isThisEmailInUse = async function (email: string): Promise<boolean> {
  if (!email) throw new Error("Invalid Email")
  try {
    const user = await this.findOne({ email })
    if (user) return false
    return true
  } catch (error: any) {
    console.log("error inside isThisEmailInUse method", error.message)
    return false
  }
}

export default mongoose.model<IUser, IUserModel>("User", userSchema)
