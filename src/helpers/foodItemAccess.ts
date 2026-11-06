import mongoose, { type FilterQuery } from "mongoose"
import type { IFoodItem } from "../models/foodItem"
import type { IUser } from "../models/user"
import {
  getHouseholdMemberIds,
  resolveHouseholdId,
} from "./householdHelpers"

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
): Promise<FilterQuery<IFoodItem>> => ({
  _id: { $in: ids },
  ...(await foodItemOwnerFilter(user)),
})
