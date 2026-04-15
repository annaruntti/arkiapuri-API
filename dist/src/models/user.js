"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const userSchema = new mongoose_1.Schema({
    username: {
        type: String,
        required: function () {
            return !this.googleId && !this.facebookId && !this.appleId;
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
            return !this.googleId && !this.facebookId && !this.appleId;
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
            type: mongoose_1.Schema.Types.ObjectId,
            ref: "FoodItem",
        },
    ],
    meals: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
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
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Household",
        default: null,
    },
}, {
    timestamps: true,
});
userSchema.pre("save", function (next) {
    if (this.isModified("password") && this.password) {
        bcrypt_1.default.hash(this.password, 8, (err, hash) => {
            if (err)
                return next(err);
            this.password = hash;
            next();
        });
    }
    else {
        next();
    }
});
userSchema.methods.comparePassword = async function (password) {
    if (!password)
        throw new Error("Password is missing");
    try {
        const result = await bcrypt_1.default.compare(password, this.password);
        return result;
    }
    catch (error) {
        console.log("Error while comparing password!", error.message);
        return false;
    }
};
userSchema.statics.isThisEmailInUse = async function (email) {
    if (!email)
        throw new Error("Invalid Email");
    try {
        const user = await this.findOne({ email });
        if (user)
            return false;
        return true;
    }
    catch (error) {
        console.log("error inside isThisEmailInUse method", error.message);
        return false;
    }
};
exports.default = mongoose_1.default.model("User", userSchema);
//# sourceMappingURL=user.js.map