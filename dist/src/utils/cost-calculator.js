"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const calculateMonthlyCosts = () => {
    const freeCosts = {
        railway: 0,
        mongodb: 0,
        total: 0,
    };
    const minimumPaidCosts = {
        railway: 5,
        mongodb: 0,
        total: 5,
    };
    return { freeCosts, minimumPaidCosts };
};
exports.default = calculateMonthlyCosts;
//# sourceMappingURL=cost-calculator.js.map