"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const trackApiUsage = async (req, res, next) => {
    const startTime = Date.now();
    res.on("finish", async () => {
        try {
            // Analytics model not yet implemented – placeholder for future use
            console.debug(`Analytics: ${req.method} ${req.path} ${res.statusCode} ${Date.now() - startTime}ms`);
        }
        catch (error) {
            console.error("Analytics error:", error);
        }
    });
    next();
};
exports.default = trackApiUsage;
//# sourceMappingURL=analytics.js.map