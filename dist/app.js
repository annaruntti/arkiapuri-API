"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const security_1 = require("./src/middleware/security");
const logger_1 = __importDefault(require("./src/middleware/logger"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const swagger_1 = __importDefault(require("./src/utils/swagger"));
const compression_1 = __importDefault(require("compression"));
const helmet_1 = __importDefault(require("helmet"));
// Load env variables first
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Validate environment variables
const validateEnv = () => {
    const required = ["MONGODB_URI", "JWT_SECRET", "CORS_ORIGIN"];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        console.error("Missing required environment variables:", missing);
        process.exit(1);
    }
    // Warn about missing social auth credentials (optional)
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        console.warn("Warning: Google OAuth credentials not configured. Social login will not work.");
    }
    // Set default APP_URL if not provided
    if (!process.env.APP_URL) {
        process.env.APP_URL = "http://localhost:3000";
        console.log("APP_URL not set, using default: http://localhost:3000");
    }
};
validateEnv();
// Database connection
require("./src/models/db");
const user_1 = __importDefault(require("./src/routes/user"));
const auth_1 = __importDefault(require("./src/routes/auth"));
const meal_1 = __importDefault(require("./src/routes/meal"));
const foodItem_1 = __importDefault(require("./src/routes/foodItem"));
const shoppingList_1 = __importDefault(require("./src/routes/shoppingList"));
const pantry_1 = __importDefault(require("./src/routes/pantry"));
const vision_1 = __importDefault(require("./src/routes/vision"));
const openFoodFacts_1 = __importDefault(require("./src/routes/openFoodFacts"));
const household_1 = __importDefault(require("./src/routes/household"));
const app = (0, express_1.default)();
// Uses helmet() as a function, not just the reference
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            scriptSrc: ["'self'"],
        },
    },
}));
// Uses CORS middleware
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin)
            return callback(null, true);
        if (process.env.NODE_ENV === "production") {
            const allowedOrigins = [
                process.env.CORS_ORIGIN || "https://my-frontend-url.com",
            ];
            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            return callback(new Error("Not allowed by CORS"));
        }
        else {
            // Development: Allow Expo and localhost
            const allowedOrigins = [
                "http://localhost:8081",
                "http://localhost:19006", // Expo web
                "exp://localhost:8081", // Expo Go
                "exp://192.168.50.179:8081", // Expo Go with IP
                /^https?:\/\/.*\.ngrok\.io$/, // ngrok tunnels
                /^exp:\/\/.*/, // Any Expo Go URL
            ];
            const isAllowed = allowedOrigins.some((allowedOrigin) => {
                if (typeof allowedOrigin === "string") {
                    return allowedOrigin === origin;
                }
                return allowedOrigin.test(origin);
            });
            if (isAllowed) {
                return callback(null, true);
            }
            console.log("CORS blocked origin:", origin);
            return callback(null, true); // Allow all in development for now
        }
    },
    credentials: true,
}));
// Uses JSON middleware
app.use(express_1.default.json());
// Creates uploads directory if it doesn't exist
const uploadsDir = path_1.default.join(__dirname, "uploads");
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir);
}
// Adds rate limiter before routes
app.use(security_1.rateLimiter);
app.use(logger_1.default);
// Adds compression after cors and before routes
if (process.env.NODE_ENV === "production") {
    app.use((0, compression_1.default)());
}
// Root route
app.get("/", (req, res) => {
    res.json({
        message: "Welcome to Arkiapuri API",
        version: "1.0.0",
        status: "running",
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
    });
});
// API routes
app.use(user_1.default);
app.use("/auth", auth_1.default);
app.use(meal_1.default);
app.use(foodItem_1.default);
app.use(shoppingList_1.default);
app.use(pantry_1.default);
app.use(vision_1.default);
app.use("/api/openfoodfacts", openFoodFacts_1.default);
app.use(household_1.default);
app.use("/api-docs", swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_1.default));
// Development route to see all registered routes
if (process.env.NODE_ENV === "development") {
    app.get("/debug/routes", (req, res) => {
        const routes = [];
        app._router.stack.forEach((middleware) => {
            if (middleware.route) {
                routes.push({
                    path: middleware.route.path,
                    methods: Object.keys(middleware.route.methods),
                });
            }
        });
        res.json(routes);
    });
}
// Health check route
app.get("/health", async (req, res) => {
    try {
        res.json({
            status: "healthy",
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
        });
    }
    catch (error) {
        res.status(503).json({
            status: "unhealthy",
            error: error.message,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
        });
    }
});
// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: "Something went wrong!",
        error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
});
// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found",
        path: req.originalUrl,
    });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`CORS enabled for: ${process.env.NODE_ENV === "production"
        ? process.env.CORS_ORIGIN
        : "http://localhost:8081"}`);
});
//# sourceMappingURL=app.js.map