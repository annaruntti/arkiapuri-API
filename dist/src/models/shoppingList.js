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
const shoppingListItemSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
    },
    estimatedPrice: {
        type: Number,
        min: 0,
    },
    price: {
        type: Number,
        min: 0,
    },
    quantity: {
        type: Number,
        default: 1,
        min: 0,
    },
    unit: {
        type: String,
        default: "kpl",
    },
    category: {
        type: [String],
        default: [],
    },
    calories: {
        type: Number,
        min: 0,
        default: 0,
    },
    bought: {
        type: Boolean,
        default: false,
    },
    foodId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "FoodItem",
    },
});
const shoppingListSchema = new mongoose_1.Schema({
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
    name: {
        type: String,
        required: true,
    },
    description: {
        type: String,
    },
    items: [shoppingListItemSchema],
    totalEstimatedPrice: {
        type: Number,
        default: 0,
    },
}, {
    timestamps: true,
});
shoppingListSchema.index({ userId: 1 });
shoppingListSchema.index({ household: 1 });
exports.default = mongoose_1.default.model("ShoppingList", shoppingListSchema);
//# sourceMappingURL=shoppingList.js.map