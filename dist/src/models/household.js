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
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const householdSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
        default: "Perhe",
    },
    owner: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    members: [
        {
            userId: {
                type: mongoose_1.Schema.Types.ObjectId,
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
}, {
    timestamps: true,
});
householdSchema.methods.isMember = function (userId) {
    return this.members.some((member) => {
        if (!member.userId)
            return false;
        const memberId = member.userId._id || member.userId;
        return memberId && memberId.toString() === userId.toString();
    });
};
householdSchema.methods.getUserRole = function (userId) {
    const member = this.members.find((m) => {
        if (!m.userId)
            return false;
        const memberId = m.userId._id || m.userId;
        return memberId && memberId.toString() === userId.toString();
    });
    return member ? member.role : null;
};
householdSchema.methods.canInvite = function (userId) {
    const role = this.getUserRole(userId);
    if (role === "owner" || role === "admin")
        return true;
    return this.settings.allowMemberInvites && role === "member";
};
exports.default = mongoose_1.default.model("Household", householdSchema);
//# sourceMappingURL=household.js.map