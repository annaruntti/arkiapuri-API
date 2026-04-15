"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tierLimits = {
    free: 1000,
    basic: 10000,
    pro: 50000,
};
// Note: This middleware is a placeholder – UsageTracker integration pending
const tierLimiter = (req, res, next) => {
    // TODO: Integrate UsageTracker when fully implemented
    next();
};
exports.default = tierLimiter;
//# sourceMappingURL=rate-limiter.js.map