"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDataOwnership = exports.getDataQuery = exports.populateUserHousehold = void 0;
/**
 * Helper middleware to populate household data for authenticated user
 */
const populateUserHousehold = async (req, res, next) => {
    if (req.user && req.user.household) {
        // Household ID is already available on req.user
        // Controllers can use it directly
    }
    next();
};
exports.populateUserHousehold = populateUserHousehold;
/**
 * Build query object for fetching household or user-specific data
 */
const getDataQuery = (user, userField = "userId") => {
    if (user.household) {
        return {
            $or: [{ [userField]: user._id }, { household: user.household }],
        };
    }
    return { [userField]: user._id };
};
exports.getDataQuery = getDataQuery;
/**
 * Get household ID or user ID for creating new data
 */
const getDataOwnership = (user) => {
    return {
        userId: user._id,
        household: user.household || null,
    };
};
exports.getDataOwnership = getDataOwnership;
//# sourceMappingURL=householdHelpers.js.map