"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Arkiapuri API",
            version: "1.0.0",
        },
        servers: [
            {
                url: process.env.NODE_ENV === "production"
                    ? "https://your-production-url"
                    : `http://localhost:${process.env.PORT || 3000}`,
            },
            {
                url: process.env.CORS_ORIGIN || "http://localhost:8081",
                description: "Frontend Server",
            },
        ],
    },
    apis: ["./src/routes/*.ts", "./src/routes/*.js"],
};
exports.default = (0, swagger_jsdoc_1.default)(options);
//# sourceMappingURL=swagger.js.map