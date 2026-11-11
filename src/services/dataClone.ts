import type { Model } from "mongoose"
import mongoose from "mongoose"
import type { IFoodItem } from "../models/foodItem"
import type { IMeal } from "../models/meal"
import type { IPantry } from "../models/pantry"
import type { IShoppingList } from "../models/shoppingList"
import type { IUser } from "../models/user"
import { resolveModule } from "../helpers/controllerUtils"
import { getDataOwnership } from "../helpers/householdHelpers"

const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))
const Meal = resolveModule<Model<IMeal>>(require("../models/meal"))
const Pantry = resolveModule<Model<IPantry>>(require("../models/pantry"))
const ShoppingList = resolveModule<Model<IShoppingList>>(
  require("../models/shoppingList")
)
const User = resolveModule<Model<IUser>>(require("../models/user"))

export type FoodIdMap = Map<string, mongoose.Types.ObjectId>

export const pickFoodCatalogFields = (item: IFoodItem) => ({
  name: item.name,
  isFood: item.isFood !== false,
  category: Array.isArray(item.category) ? [...item.category] : [],
  unit: item.unit || "kpl",
  packageQuantity: item.packageQuantity,
  price: item.price,
  priceSource: item.priceSource,
  calories: item.calories,
  nutrition: item.nutrition ? { ...item.nutrition } : undefined,
  image: item.image
    ? { url: item.image.url, publicId: item.image.publicId }
    : undefined,
  openFoodFactsData: item.openFoodFactsData
    ? { ...item.openFoodFactsData }
    : undefined,
})

/** Clone a FoodItem as owned by `ownerId` (empty pantry/meal quantities). */
export const cloneFoodItemForUser = async (
  source: IFoodItem,
  ownerId: mongoose.Types.ObjectId
): Promise<IFoodItem> => {
  const cloned = new FoodItem({
    ...pickFoodCatalogFields(source),
    user: ownerId,
    locations: [],
    quantities: { meal: 0, "shopping-list": 0, pantry: 0 },
  })
  await cloned.save()
  await User.findByIdAndUpdate(ownerId, { $addToSet: { foodItems: cloned._id } })
  return cloned
}

export const cloneMealForUser = async (
  source: IMeal,
  ownerId: mongoose.Types.ObjectId,
  foodIdMap: FoodIdMap,
  household: mongoose.Types.ObjectId | null = null
): Promise<IMeal> => {
  const foodItems = (source.foodItems || []).map((row) => {
    const key = String(row.foodId)
    const mapped = foodIdMap.get(key) || row.foodId
    return {
      foodId: mapped,
      quantity: row.quantity,
      unit: row.unit || "kpl",
    }
  })

  const cloned = new Meal({
    name: source.name,
    recipe: source.recipe,
    recipeSteps: Array.isArray(source.recipeSteps)
      ? [...source.recipeSteps]
      : [],
    difficultyLevel: source.difficultyLevel,
    cookingTime: source.cookingTime,
    defaultRoles: source.defaultRoles,
    mealCategory: Array.isArray(source.mealCategory)
      ? [...source.mealCategory]
      : [],
    plannedCookingDate: undefined,
    plannedEatingDates: [],
    servings: source.servings || 4,
    foodItems,
    user: ownerId,
    household,
    image: source.image
      ? { url: source.image.url, publicId: source.image.publicId }
      : undefined,
  })
  await cloned.save()
  await User.findByIdAndUpdate(ownerId, { $addToSet: { meals: cloned._id } })
  return cloned
}

const remapEmbeddedFoodIds = <T extends { foodId?: mongoose.Types.ObjectId }>(
  items: T[],
  foodIdMap: FoodIdMap
): T[] =>
  items.map((item) => {
    if (!item.foodId) return { ...item }
    const mapped = foodIdMap.get(String(item.foodId))
    return mapped ? { ...item, foodId: mapped } : { ...item }
  })

export const clonePantryForUser = async (
  source: IPantry,
  ownerId: mongoose.Types.ObjectId,
  foodIdMap: FoodIdMap
): Promise<IPantry> => {
  const locationIdMap = new Map<string, mongoose.Types.ObjectId>()
  const locations = (source.locations || []).map((loc) => {
    const id = new mongoose.Types.ObjectId()
    locationIdMap.set(String(loc._id), id)
    return {
      _id: id,
      type: loc.type,
      name: loc.name,
    }
  })

  const items = (source.items || []).map((item) => {
    const plain = typeof item.toObject === "function" ? item.toObject() : item
    const foodId = plain.foodId
      ? foodIdMap.get(String(plain.foodId)) || plain.foodId
      : undefined
    const locationId = plain.locationId
      ? locationIdMap.get(String(plain.locationId)) || null
      : null
    const { _id: _ignored, ...rest } = plain as Record<string, unknown>
    return { ...rest, foodId, locationId }
  })

  const cloned = new Pantry({
    userId: ownerId,
    household: null,
    locations,
    removalSuggestions: [],
    items,
  })
  await cloned.save()
  return cloned
}

export const cloneShoppingListForUser = async (
  source: IShoppingList,
  ownerId: mongoose.Types.ObjectId,
  foodIdMap: FoodIdMap
): Promise<IShoppingList> => {
  const items = remapEmbeddedFoodIds(
    (source.items || []).map((item) =>
      typeof item.toObject === "function" ? item.toObject() : { ...item }
    ),
    foodIdMap
  ).map((item) => {
    const { _id: _ignored, ...rest } = item as Record<string, unknown>
    return rest
  })

  const cloned = new ShoppingList({
    userId: ownerId,
    household: null,
    name: source.name,
    description: source.description,
    items,
    totalEstimatedPrice: source.totalEstimatedPrice || 0,
  })
  await cloned.save()
  return cloned
}

/** Ensure owner has a FoodItem for each id (clone missing ones). Returns full id map. */
export const ensureFoodItemsOwnedByUser = async (
  user: IUser,
  foodIds: mongoose.Types.ObjectId[]
): Promise<FoodIdMap> => {
  const ownerId = user._id as mongoose.Types.ObjectId
  const unique = [...new Set(foodIds.map((id) => String(id)))]
  const map: FoodIdMap = new Map()

  for (const id of unique) {
    const existing = await FoodItem.findOne({ _id: id, user: ownerId })
    if (existing) {
      map.set(id, existing._id as mongoose.Types.ObjectId)
      continue
    }
    const source = await FoodItem.findById(id)
    if (!source) continue
    const cloned = await cloneFoodItemForUser(source, ownerId)
    map.set(id, cloned._id as mongoose.Types.ObjectId)
  }

  return map
}

export const ownershipForUser = (user: IUser) => getDataOwnership(user)
