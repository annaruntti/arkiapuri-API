import { Request, Response, NextFunction } from "express"
import type { Model } from "mongoose"
import mongoose from "mongoose"
import type { IHousehold } from "../models/household"
import type { IMeal } from "../models/meal"
import type { IPantry } from "../models/pantry"
import type { IShoppingList } from "../models/shoppingList"
import { IUser } from "../models/user"
import { resolveModule } from "./controllerUtils"

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
  if (household instanceof mongoose.Types.ObjectId) {
    return household
  }
  if (typeof household === "object" && household !== null && "_id" in household) {
    return (household as { _id: mongoose.Types.ObjectId })._id
  }
  return household as mongoose.Types.ObjectId
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

const asObjectId = (value: unknown): mongoose.Types.ObjectId | null => {
  if (!value) return null
  if (value instanceof mongoose.Types.ObjectId) return value
  if (typeof value === "object" && value !== null && "_id" in value) {
    return asObjectId((value as { _id: unknown })._id)
  }
  return value as mongoose.Types.ObjectId
}

export const getHouseholdMemberIds = async (
  householdId: mongoose.Types.ObjectId
): Promise<mongoose.Types.ObjectId[]> => {
  const Household = resolveModule<Model<IHousehold>>(
    require("../models/household")
  )
  const household = await Household.findById(householdId).select(
    "members.userId owner"
  )
  if (!household) return []

  const ids = new Map<string, mongoose.Types.ObjectId>()
  const add = (value: unknown) => {
    const id = asObjectId(value)
    if (id) ids.set(String(id), id)
  }

  add(household.owner)
  household.members.forEach((member) => add(member.userId))
  return [...ids.values()]
}

const untaggedHousehold = {
  $or: [{ household: null }, { household: { $exists: false } }],
}

/**
 * Stamp household on members' existing pantry, shopping lists and meals so
 * they become visible to the whole family. New docs already get this via
 * getDataOwnership; this covers data created before joining.
 */
export const shareHouseholdDocuments = async (
  householdId: mongoose.Types.ObjectId
): Promise<mongoose.Types.ObjectId[]> => {
  const memberIds = await getHouseholdMemberIds(householdId)
  if (memberIds.length === 0) return memberIds

  const Pantry = resolveModule<Model<IPantry>>(require("../models/pantry"))
  const ShoppingList = resolveModule<Model<IShoppingList>>(
    require("../models/shoppingList")
  )
  const Meal = resolveModule<Model<IMeal>>(require("../models/meal"))

  await Promise.all([
    Pantry.updateMany(
      { userId: { $in: memberIds }, ...untaggedHousehold },
      { $set: { household: householdId } }
    ),
    ShoppingList.updateMany(
      { userId: { $in: memberIds }, ...untaggedHousehold },
      { $set: { household: householdId } }
    ),
    Meal.updateMany(
      { user: { $in: memberIds }, ...untaggedHousehold },
      { $set: { household: householdId } }
    ),
  ])

  return memberIds
}

/**
 * Build query object for fetching household or user-specific data.
 * Household members must see each other's meals and shopping lists even when
 * older documents were never tagged with `household`.
 */
export const getDataQuery = async (
  user: IUser,
  userField = "userId"
): Promise<Record<string, unknown>> => {
  const householdId = resolveHouseholdId(user)
  if (!householdId) {
    return { [userField]: user._id }
  }

  const memberIds = await shareHouseholdDocuments(householdId)
  const ownerIds =
    memberIds.length > 0
      ? memberIds
      : [user._id as mongoose.Types.ObjectId]

  return {
    $or: [{ [userField]: { $in: ownerIds } }, { household: householdId }],
  }
}
