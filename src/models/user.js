const mongoose = require("mongoose")
const bcrypt = require("bcrypt")

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: function () {
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
      required: function () {
        return !this.googleId && !this.facebookId && !this.appleId
      },
    },
    avatar: String,
    profilePicture: String,
    // Social authentication IDs
    googleId: String,
    facebookId: String,
    appleId: String,
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    foodItems: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "FoodItem",
      },
    ],
    meals: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Meal",
      },
    ],
    profileImage: {
      url: String,
      publicId: String,
    },
    // Password reset fields
    resetPasswordToken: String,
    resetPasswordExpiry: Date,
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

userSchema.methods.comparePassword = async function (password) {
  if (!password) throw new Error("Password is missing")

  try {
    const result = await bcrypt.compare(password, this.password)
    return result
  } catch (error) {
    console.log("Error while comparing password!", error.message)
  }
}

userSchema.statics.isThisEmailInUse = async function (email) {
  if (!email) throw new Error("Invalid Email")
  try {
    const user = await this.findOne({ email })
    if (user) return false

    return true
  } catch (error) {
    console.log("error inside isThisEmailInUse method", error.message)
    return false
  }
}

module.exports = mongoose.model("User", userSchema)
