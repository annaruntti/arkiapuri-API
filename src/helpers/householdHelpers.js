/**
 * Helper middleware to populate household data for authenticated user
 * Adds household property to req.user if user belongs to a household
 */
const populateUserHousehold = async (req, res, next) => {
  if (req.user && req.user.household) {
    // Household ID is already available on req.user
    // Controllers can use it directly
  }
  next()
}

/**
 * Build query object for fetching household or user-specific data
 * Users should see:
 * 1. Their own data (items they created)
 * 2. If in a household: also see all household data
 *
 * @param {Object} user - The authenticated user object
 * @param {string} userField - The field name to use for user ID (default: 'userId', can be 'user' for Meal model)
 * @returns {Object} Query object with $or condition for user and household data
 */
const getDataQuery = (user, userField = "userId") => {
  if (user.household) {
    // User is part of a household, fetch both user's data AND household data
    return {
      $or: [{ [userField]: user._id }, { household: user.household }],
    }
  }
  // User is not part of a household, fetch only user-specific data
  return { [userField]: user._id }
}

/**
 * Get household ID or user ID for creating new data
 * @param {Object} user - The authenticated user object
 * @returns {Object} Object with household and/or userId
 */
const getDataOwnership = (user) => {
  return {
    userId: user._id,
    household: user.household || null,
  }
}

module.exports = {
  populateUserHousehold,
  getDataQuery,
  getDataOwnership,
}

