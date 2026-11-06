import mongoose, { type FilterQuery } from "mongoose"
import type { IFoodItem } from "../models/foodItem"
import type { IUser } from "../models/user"
import {
  getHouseholdMemberIds,
  resolveHouseholdId,
} from "./householdHelpers"

/** Pure filter builder (also used by unit tests). */
export const scopedFoodItemIdsFilter = (
  ids: unknown[],
  memberIds: mongoose.Types.ObjectId[],
  fallbackUserId?: mongoose.Types.ObjectId
): FilterQuery<IFoodItem> => {
  if (memberIds.length > 0) {
    return {
      _id: { $in: ids },
      user: mongoose.trusted({ $in: memberIds }),
    }
  }
  return {
    _id: { $in: ids },
    user: fallbackUserId,
  }
}

/**
 * Scope FoodItem queries to the user's household catalog owners.
 */
export const foodItemOwnerFilter = async (
  user: IUser
): Promise<FilterQuery<IFoodItem>> => {
  const householdId = resolveHouseholdId(user)
  const memberIds = householdId
    ? await getHouseholdMemberIds(householdId)
    : []
  if (memberIds.length > 0) {
    return { user: mongoose.trusted({ $in: memberIds }) }
  }
  return { user: user._id }
}

export const foodItemsOwnedFilter = async (
  user: IUser,
  ids: unknown[]
): Promise<FilterQuery<IFoodItem>> => {
  const householdId = resolveHouseholdId(user)
  const memberIds = householdId
    ? await getHouseholdMemberIds(householdId)
    : []
  return scopedFoodItemIdsFilter(
    ids,
    memberIds,
    user._id as mongoose.Types.ObjectId
  )
}
