import { Request, Response, NextFunction } from "express"
import { IUser } from "../models/user"
import mongoose from "mongoose"

/**
 * Helper middleware to populate household data for authenticated user
 */
export const populateUserHousehold = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  if (req.user && req.user.household) {
    // Household ID is already available on req.user
    // Controllers can use it directly
  }
  next()
}

/**
 * Household is populated in auth middleware, so `user.household` may be a
 * document. Queries and new-doc ownership must use the ObjectId.
 */
export const resolveHouseholdId = (
  user: IUser
): mongoose.Types.ObjectId | null => {
  const household = user.household as unknown
  if (!household) return null
  if (typeof household === "object" && household !== null && "_id" in household) {
    return (household as { _id: mongoose.Types.ObjectId })._id
  }
  return household as mongoose.Types.ObjectId
}

/**
 * Build query object for fetching household or user-specific data
 */
export const getDataQuery = (
  user: IUser,
  userField = "userId"
): Record<string, unknown> => {
  const householdId = resolveHouseholdId(user)
  if (householdId) {
    return {
      $or: [{ [userField]: user._id }, { household: householdId }],
    }
  }
  return { [userField]: user._id }
}

/**
 * Get household ID or user ID for creating new data
 */
export const getDataOwnership = (
  user: IUser
): { userId: mongoose.Types.ObjectId; household: mongoose.Types.ObjectId | null } => {
  return {
    userId: user._id as mongoose.Types.ObjectId,
    household: resolveHouseholdId(user),
  }
}
