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
const foodItemSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    category: {
        type: [String],
        default: [],
    },
    unit: {
        type: String,
        required: true,
    },
    price: {
        type: Number,
    },
    calories: {
        type: Number,
    },
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    locations: [
        {
            type: String,
            enum: ["meal", "shopping-list", "pantry"],
        },
    ],
    quantities: {
        meal: { type: Number, default: 0 },
        "shopping-list": { type: Number, default: 0 },
        pantry: { type: Number, default: 0 },
    },
    expireDay: {
        type: Date,
    },
    expirationDate: {
        type: Date,
    },
    image: {
        url: { type: String },
        publicId: { type: String },
    },
    openFoodFactsData: {
        barcode: String,
        brands: String,
        nutritionGrade: {
            type: String,
            enum: ["a", "b", "c", "d", "e"],
        },
        novaGroup: {
            type: Number,
            enum: [1, 2, 3, 4],
        },
        imageUrl: String,
        nutrition: {
            proteins: { type: Number, default: 0 },
            carbohydrates: { type: Number, default: 0 },
            sugars: { type: Number, default: 0 },
            fat: { type: Number, default: 0 },
            saturatedFat: { type: Number, default: 0 },
            fiber: { type: Number, default: 0 },
            sodium: { type: Number, default: 0 },
            salt: { type: Number, default: 0 },
        },
        labels: [String],
        allergens: [String],
        lastUpdated: Date,
    },
}, {
    timestamps: true,
});
foodItemSchema.index({ user: 1, locations: 1 });
foodItemSchema.methods.updateLocations = function () {
    this.locations = Object.entries(this.quantities)
        .filter(([_, quantity]) => quantity > 0)
        .map(([location]) => location);
};
foodItemSchema.pre("save", function (next) {
    this.updateLocations();
    next();
});
exports.default = mongoose_1.default.model("FoodItem", foodItemSchema);
//# sourceMappingURL=foodItem.js.map