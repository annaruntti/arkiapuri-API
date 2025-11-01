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
 * If user belongs to a household, query by household
 * Otherwise, query by userId
 *
 * @param {Object} user - The authenticated user object
 * @returns {Object} Query object with either household or userId
 */
const getDataQuery = (user) => {
  if (user.household) {
    // User is part of a household, fetch household data
    return { household: user.household }
  }
  // User is not part of a household, fetch user-specific data
  return { userId: user._id }
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

