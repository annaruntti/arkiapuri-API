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
const pantryItemSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    quantity: {
        type: Number,
        required: true,
        min: 0,
        default: 1,
    },
    unit: {
        type: String,
        required: true,
        default: "kpl",
    },
    expirationDate: {
        type: Date,
        default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    foodId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "FoodItem",
    },
    category: {
        type: [String],
        default: [],
    },
    calories: {
        type: Number,
        default: 0,
    },
    price: {
        type: Number,
        default: 0,
    },
    notes: {
        type: String,
        trim: true,
    },
    addedFrom: {
        type: String,
        enum: ["pantry", "shopping-list"],
        default: "pantry",
    },
});
const pantrySchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    household: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Household",
        default: null,
    },
    items: [pantryItemSchema],
}, {
    timestamps: true,
});
pantrySchema.index({ userId: 1 });
pantrySchema.index({ household: 1 });
pantrySchema.index({ "items.expirationDate": 1 });
pantrySchema.index({ "items.name": 1 });
pantrySchema.methods.getExpiringItems = function (days = 7) {
    const expirationDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return this.items.filter((item) => item.expirationDate <= expirationDate && item.expirationDate > new Date());
};
pantrySchema.methods.findItem = function (itemName) {
    return this.items.find((item) => item.name.toLowerCase() === itemName.toLowerCase());
};
pantrySchema.methods.updateItemQuantity = function (itemId, quantity) {
    const item = this.items.find((i) => i._id?.toString() === itemId.toString());
    if (item) {
        item.quantity = Math.max(0, quantity);
        return true;
    }
    return false;
};
exports.default = mongoose_1.default.model("Pantry", pantrySchema);
//# sourceMappingURL=pantry.js.map