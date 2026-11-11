import type { Model } from "mongoose"
import mongoose from "mongoose"
import type { IFoodItem } from "../models/foodItem"
import type { IMeal } from "../models/meal"
import type { IPantry } from "../models/pantry"
import type { IShoppingList } from "../models/shoppingList"
import type { IUser } from "../models/user"
import { resolveModule } from "../helpers/controllerUtils"
import { getHouseholdMemberIds } from "../helpers/householdHelpers"
import {
  cloneFoodItemForUser,
  cloneMealForUser,
  clonePantryForUser,
  cloneShoppingListForUser,
  type FoodIdMap,
} from "./dataClone"

const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))
const Meal = resolveModule<Model<IMeal>>(require("../models/meal"))
const Pantry = resolveModule<Model<IPantry>>(require("../models/pantry"))
const ShoppingList = resolveModule<Model<IShoppingList>>(
  require("../models/shoppingList")
)

/**
 * Before clearing household membership: copy shared household-visible data
 * onto the departing user's personal account so they keep editable copies.
 * Household originals are left unchanged.
 */
export const forkHouseholdDataForDepartingUser = async (
  user: IUser,
  householdId: mongoose.Types.ObjectId
): Promise<{ foodItems: number; meals: number; pantries: number; lists: number }> => {
  const departingId = user._id as mongoose.Types.ObjectId
  const memberIds = await getHouseholdMemberIds(householdId)
  const foodIdMap: FoodIdMap = new Map()

  // 1) FoodItems owned by other members → personal copies
  const sharedFoods = await FoodItem.find({
    user: { $in: memberIds },
  })

  for (const item of sharedFoods) {
    const sourceId = String(item._id)
    if (String(item.user) === String(departingId)) {
      foodIdMap.set(sourceId, item._id as mongoose.Types.ObjectId)
      continue
    }
    const cloned = await cloneFoodItemForUser(item, departingId)
    foodIdMap.set(sourceId, cloned._id as mongoose.Types.ObjectId)
  }

  // 2) Meals visible via member ownership or household tag
  const meals = await Meal.find({
    $or: [{ user: { $in: memberIds } }, { household: householdId }],
  })

  let mealCopies = 0
  for (const meal of meals) {
    if (String(meal.user) === String(departingId)) {
      if (meal.household) {
        meal.household = null
        // Remap any foodIds that were forked
        meal.foodItems = (meal.foodItems || []).map((row) => {
          const mapped = foodIdMap.get(String(row.foodId))
          return mapped
            ? { foodId: mapped, quantity: row.quantity, unit: row.unit }
            : row
        }) as typeof meal.foodItems
        await meal.save()
      }
      continue
    }

    // Ensure every ingredient foodId is in the map
    for (const row of meal.foodItems || []) {
      const key = String(row.foodId)
      if (foodIdMap.has(key)) continue
      const source = await FoodItem.findById(row.foodId)
      if (!source) continue
      if (String(source.user) === String(departingId)) {
        foodIdMap.set(key, source._id as mongoose.Types.ObjectId)
      } else {
        const cloned = await cloneFoodItemForUser(source, departingId)
        foodIdMap.set(key, cloned._id as mongoose.Types.ObjectId)
      }
    }

    await cloneMealForUser(meal, departingId, foodIdMap, null)
    mealCopies += 1
  }

  // 3) Pantries
  const pantries = await Pantry.find({
    $or: [{ userId: { $in: memberIds } }, { household: householdId }],
  })
  let pantryCopies = 0
  for (const pantry of pantries) {
    if (String(pantry.userId) === String(departingId)) {
      if (pantry.household) {
        pantry.household = null
        await pantry.save()
      }
      continue
    }
    await clonePantryForUser(pantry, departingId, foodIdMap)
    pantryCopies += 1
  }

  // 4) Shopping lists
  const lists = await ShoppingList.find({
    $or: [{ userId: { $in: memberIds } }, { household: householdId }],
  })
  let listCopies = 0
  for (const list of lists) {
    if (String(list.userId) === String(departingId)) {
      if (list.household) {
        list.household = null
        await list.save()
      }
      continue
    }
    await cloneShoppingListForUser(list, departingId, foodIdMap)
    listCopies += 1
  }

  const foodCopies = [...foodIdMap.entries()].filter(
    ([from, to]) => from !== String(to)
  ).length

  return {
    foodItems: foodCopies,
    meals: mealCopies,
    pantries: pantryCopies,
    lists: listCopies,
  }
}
