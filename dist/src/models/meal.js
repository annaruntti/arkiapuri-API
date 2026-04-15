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
const mealSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
    },
    recipe: {
        type: String,
    },
    difficultyLevel: {
        type: String,
        enum: ["easy", "medium", "hard"],
    },
    cookingTime: {
        type: Number,
    },
    defaultRoles: {
        type: String,
        required: true,
        get: function (v) {
            try {
                return JSON.parse(v);
            }
            catch (e) {
                return ["dinner"];
            }
        },
        set: function (v) {
            const roles = Array.isArray(v) ? v : [v];
            const validRoles = [
                "breakfast",
                "lunch",
                "snack",
                "dinner",
                "supper",
                "dessert",
                "other",
            ];
            const filteredRoles = roles.filter((role) => validRoles.includes(role));
            if (filteredRoles.length === 0) {
                return JSON.stringify(["dinner"]);
            }
            return JSON.stringify(filteredRoles);
        },
        validate: {
            validator: function (v) {
                try {
                    const roles = JSON.parse(v);
                    return Array.isArray(roles) && roles.length > 0;
                }
                catch (e) {
                    return false;
                }
            },
            message: "At least one valid meal role is required",
        },
    },
    mealCategory: {
        type: String,
        enum: [
            "salad",
            "pasta",
            "soup",
            "casserole",
            "stew",
            "pizza",
            "texmex",
            "burger",
            "steak",
            "fish",
            "vegetarian",
            "other",
        ],
        default: "other",
    },
    plannedCookingDate: {
        type: Date,
    },
    plannedEatingDates: {
        type: [Date],
        default: [],
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    foodItems: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: "FoodItem",
        },
    ],
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    household: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Household",
        default: null,
    },
    image: {
        url: { type: String },
        publicId: { type: String },
    },
});
mealSchema.set("toJSON", { getters: true });
exports.default = mongoose_1.default.model("Meal", mealSchema);
//# sourceMappingURL=meal.js.map