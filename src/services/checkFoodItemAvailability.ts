import type { Model } from "mongoose"
import type { IFoodItem } from "../models/foodItem"
import type { IPantryItem } from "../models/pantry"
import type { IShoppingList, IShoppingListItem } from "../models/shoppingList"
import type { IUser } from "../models/user"
import { resolveModule } from "../helpers/controllerUtils"
import {
  getDataQuery,
  getHouseholdMemberIds,
  resolveHouseholdId,
} from "../helpers/householdHelpers"
import { getCanonicalPantry } from "../helpers/pantryHelpers"
import { scoreCatalogNameMatch } from "./foodNameMatch"
import { normalizeAppUnit } from "../utils/openFoodFactsMapper"
import {
  EMPTY_QUANTITIES,
  getPopulatedFoodName,
  resolveLocatedFoodId,
} from "./foodItemFields"

const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))
const ShoppingList = resolveModule<Model<IShoppingList>>(
  require("../models/shoppingList")
)

type PopulatedFoodRef = Pick<IFoodItem, "_id" | "name">

const availabilityNamesMatch = (query: string, candidate: string): boolean =>
  Boolean(query && candidate && scoreCatalogNameMatch(query, candidate) !== null)

export interface CheckFoodItemAvailabilityInput {
  name?: string
  foodId?: string
}

export const checkFoodItemAvailabilityForUser = async (
  user: IUser,
  input: CheckFoodItemAvailabilityInput
) => {
  const { name, foodId } = input
  const searchName = name?.trim() || ""

  if (!searchName && !foodId) {
    return {
      status: "bad_request" as const,
      message: "Food item name is required",
    }
  }

  const householdId = resolveHouseholdId(user)
  const memberIds = householdId
    ? await getHouseholdMemberIds(householdId)
    : []
  const catalogQuery =
    memberIds.length > 0
      ? { user: { $in: memberIds } }
      : { user: user._id }

  const allFoodItems: IFoodItem[] = await FoodItem.find(catalogQuery)
  const matchingItems: IFoodItem[] = []
  const matchingIds = new Set<string>()

  if (foodId) matchingIds.add(String(foodId))

  for (const item of allFoodItems) {
    const itemId = String(item._id)
    const isIdMatch = matchingIds.has(itemId)
    const isNameMatch = Boolean(
      searchName && availabilityNamesMatch(searchName, item.name)
    )
    if (isIdMatch || isNameMatch) {
      matchingItems.push(item)
      matchingIds.add(itemId)
    }
  }

  const pantry = await getCanonicalPantry(user)
  await pantry.populate<{
    items: Array<
      Omit<IPantryItem, "foodId"> & { foodId?: PopulatedFoodRef | null }
    >
  }>("items.foodId", "name")

  let inPantry = false
  let pantryQuantity = 0
  let pantryUnit = "kpl"
  if (pantry?.items) {
    for (const pantryItem of pantry.items) {
      const populatedId = resolveLocatedFoodId(pantryItem.foodId)
      const populatedName = getPopulatedFoodName(pantryItem.foodId)
      const itemName = populatedName ?? pantryItem.name ?? ""

      if (
        (populatedId && matchingIds.has(populatedId)) ||
        availabilityNamesMatch(searchName, itemName)
      ) {
        inPantry = true
        pantryQuantity = pantryItem.quantity || 0
        pantryUnit = normalizeAppUnit(pantryItem.unit)
        break
      }
    }
  }

  const shoppingLists = await ShoppingList.find(await getDataQuery(user)).populate<{
    items: Array<
      Omit<IShoppingListItem, "foodId"> & { foodId?: PopulatedFoodRef | null }
    >
  }>("items.foodId", "name")

  let inShoppingList = false
  let shoppingListQuantity = 0
  let shoppingListUnit = "kpl"
  let shoppingListId: IShoppingList["_id"] | null = null

  for (const list of shoppingLists) {
    if (!list.items) continue

    for (const listItem of list.items) {
      const populatedId = resolveLocatedFoodId(listItem.foodId)
      const populatedName = getPopulatedFoodName(listItem.foodId)
      const itemName = populatedName ?? listItem.name ?? ""

      if (
        (populatedId && matchingIds.has(populatedId)) ||
        availabilityNamesMatch(searchName, itemName)
      ) {
        inShoppingList = true
        shoppingListQuantity = listItem.quantity || 0
        shoppingListUnit = normalizeAppUnit(listItem.unit)
        shoppingListId = list._id
        break
      }
    }

    if (inShoppingList) break
  }

  return {
    status: "ok" as const,
    inPantry,
    pantryQuantity,
    pantryUnit,
    inShoppingList,
    shoppingListQuantity,
    shoppingListUnit,
    shoppingListId,
    hasMatchingFoodItem: matchingItems.length > 0,
    matchingFoodItems: matchingItems.map((item) => ({
      _id: item._id,
      name: item.name,
      quantities: EMPTY_QUANTITIES,
    })),
  }
}
