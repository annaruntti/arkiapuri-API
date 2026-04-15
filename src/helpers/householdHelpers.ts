import { Request, Response, NextFunction } from "express"
import { IUser } from "../models/user"
import mongoose from "mongoose"

/**
 * Helper middleware to populate household data for authenticated user
 */
export const populateUserHousehold = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (req.user && req.user.household) {
    // Household ID is already available on req.user
    // Controllers can use it directly
  }
  next()
}

/**
 * Build query object for fetching household or user-specific data
 */
export const getDataQuery = (
  user: IUser,
  userField = "userId"
): Record<string, unknown> => {
  if (user.household) {
    return {
      $or: [{ [userField]: user._id }, { household: user.household }],
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
    household: (user.household as mongoose.Types.ObjectId) || null,
  }
}
