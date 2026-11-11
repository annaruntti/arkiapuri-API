import type { Model } from "mongoose"
import mongoose from "mongoose"
import type { IFoodItem } from "../models/foodItem"
import type { IGlobalFoodItem } from "../models/globalFoodItem"
import type { IGlobalMeal } from "../models/globalMeal"
import type { IMeal } from "../models/meal"
import type { IUser } from "../models/user"
import { resolveModule } from "../helpers/controllerUtils"
import { getDataOwnership } from "../helpers/householdHelpers"
import { pickFoodCatalogFields } from "./dataClone"

const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))
const Meal = resolveModule<Model<IMeal>>(require("../models/meal"))
const GlobalFoodItem = resolveModule<Model<IGlobalFoodItem>>(
  require("../models/globalFoodItem")
)
const GlobalMeal = resolveModule<Model<IGlobalMeal>>(
  require("../models/globalMeal")
)

export type CatalogResult<T> =
  | { status: "ok"; data: T }
  | { status: "bad_request" | "not_found" | "forbidden" | "conflict"; message: string }

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export const listPrivateFoodItemsForAdmin = async (q?: string, limit = 50) => {
  const filter: Record<string, unknown> = {}
  if (q && q.trim()) {
    filter.name = { $regex: escapeRegex(q.trim()), $options: "i" }
  }
  const items = await FoodItem.find(filter)
    .sort({ updatedAt: -1 })
    .limit(Math.min(limit, 100))
    .select(
      "name isFood category unit packageQuantity price calories nutrition image openFoodFactsData user updatedAt"
    )
    .lean()
  return items
}

export const publishFoodItemToCatalog = async (
  admin: IUser,
  foodItemId: string
): Promise<CatalogResult<IGlobalFoodItem>> => {
  if (!mongoose.Types.ObjectId.isValid(foodItemId)) {
    return { status: "bad_request", message: "Invalid food item id" }
  }

  const existing = await GlobalFoodItem.findOne({ sourceFoodItemId: foodItemId })
  if (existing) {
    return { status: "ok", data: existing }
  }

  const source = await FoodItem.findById(foodItemId)
  if (!source) {
    return { status: "not_found", message: "Food item not found" }
  }

  const published = await GlobalFoodItem.create({
    ...pickFoodCatalogFields(source),
    publishedBy: admin._id,
    sourceFoodItemId: source._id,
  })
  return { status: "ok", data: published }
}

export const listAdminMeals = async (admin: IUser, q?: string, limit = 50) => {
  const filter: Record<string, unknown> = { user: admin._id }
  if (q && q.trim()) {
    filter.name = { $regex: escapeRegex(q.trim()), $options: "i" }
  }
  return Meal.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, 100))
    .populate("foodItems.foodId", "name unit")
}

export const publishMealToCatalog = async (
  admin: IUser,
  mealId: string
): Promise<CatalogResult<IGlobalMeal>> => {
  if (!mongoose.Types.ObjectId.isValid(mealId)) {
    return { status: "bad_request", message: "Invalid meal id" }
  }

  const existing = await GlobalMeal.findOne({ sourceMealId: mealId })
  if (existing) {
    return { status: "ok", data: existing }
  }

  const source = await Meal.findOne({ _id: mealId, user: admin._id }).populate(
    "foodItems.foodId"
  )
  if (!source) {
    return { status: "not_found", message: "Meal not found" }
  }

  const ingredients = []
  for (const row of source.foodItems || []) {
    const food = row.foodId as unknown as IFoodItem | null
    if (!food || !food._id) {
      ingredients.push({
        globalFoodId: null,
        name: "Unknown",
        quantity: row.quantity,
        unit: row.unit || "kpl",
      })
      continue
    }

    let globalFood = await GlobalFoodItem.findOne({
      sourceFoodItemId: food._id,
    })
    if (!globalFood) {
      globalFood = await GlobalFoodItem.create({
        ...pickFoodCatalogFields(food),
        publishedBy: admin._id,
        sourceFoodItemId: food._id,
      })
    }

    ingredients.push({
      globalFoodId: globalFood._id,
      name: food.name || globalFood.name,
      quantity: row.quantity,
      unit: row.unit || food.unit || "kpl",
    })
  }

  const published = await GlobalMeal.create({
    name: source.name,
    recipe: source.recipe,
    recipeSteps: source.recipeSteps || [],
    difficultyLevel: source.difficultyLevel,
    cookingTime: source.cookingTime,
    defaultRoles: source.defaultRoles,
    mealCategory: source.mealCategory || [],
    servings: source.servings || 4,
    foodItems: ingredients,
    image: source.image
      ? { url: source.image.url, publicId: source.image.publicId }
      : undefined,
    publishedBy: admin._id,
    sourceMealId: source._id,
  })

  return { status: "ok", data: published }
}

export const listGlobalFoodItems = async (q?: string, limit = 50) => {
  const filter: Record<string, unknown> = {}
  if (q && q.trim()) {
    filter.name = { $regex: escapeRegex(q.trim()), $options: "i" }
  }
  return GlobalFoodItem.find(filter)
    .sort({ name: 1 })
    .limit(Math.min(limit, 100))
}

export const listGlobalMeals = async (q?: string, limit = 50) => {
  const filter: Record<string, unknown> = {}
  if (q && q.trim()) {
    filter.name = { $regex: escapeRegex(q.trim()), $options: "i" }
  }
  return GlobalMeal.find(filter)
    .sort({ name: 1 })
    .limit(Math.min(limit, 100))
    .populate("foodItems.globalFoodId", "name unit")
}

export const copyGlobalFoodItemToUser = async (
  user: IUser,
  globalId: string
): Promise<CatalogResult<IFoodItem>> => {
  if (!mongoose.Types.ObjectId.isValid(globalId)) {
    return { status: "bad_request", message: "Invalid catalog food id" }
  }
  const global = await GlobalFoodItem.findById(globalId)
  if (!global) {
    return { status: "not_found", message: "Catalog food item not found" }
  }

  const ownerId = user._id as mongoose.Types.ObjectId
  const FoodItemModel = FoodItem
  const cloned = new FoodItemModel({
    name: global.name,
    isFood: global.isFood !== false,
    category: global.category || [],
    unit: global.unit || "kpl",
    packageQuantity: global.packageQuantity,
    price: global.price,
    priceSource: global.priceSource,
    calories: global.calories,
    nutrition: global.nutrition,
    image: global.image,
    openFoodFactsData: global.openFoodFactsData,
    user: ownerId,
    locations: [],
    quantities: { meal: 0, "shopping-list": 0, pantry: 0 },
  })
  await cloned.save()
  await resolveModule<Model<IUser>>(require("../models/user")).findByIdAndUpdate(
    ownerId,
    { $addToSet: { foodItems: cloned._id } }
  )
  return { status: "ok", data: cloned }
}

export const copyGlobalMealToUser = async (
  user: IUser,
  globalId: string
): Promise<CatalogResult<IMeal>> => {
  if (!mongoose.Types.ObjectId.isValid(globalId)) {
    return { status: "bad_request", message: "Invalid catalog meal id" }
  }
  const global = await GlobalMeal.findById(globalId)
  if (!global) {
    return { status: "not_found", message: "Catalog meal not found" }
  }

  const ownership = getDataOwnership(user)
  const mealFoodItems: Array<{
    foodId: mongoose.Types.ObjectId
    quantity: number
    unit: string
  }> = []
  const User = resolveModule<Model<IUser>>(require("../models/user"))

  for (const row of global.foodItems || []) {
    let personalFood: IFoodItem | null = null
    if (row.globalFoodId) {
      const gFood = await GlobalFoodItem.findById(row.globalFoodId)
      if (gFood) {
        const copied = await copyGlobalFoodItemToUser(user, String(gFood._id))
        if (copied.status === "ok") personalFood = copied.data
      }
    }
    if (!personalFood) {
      personalFood = await FoodItem.create({
        name: row.name || "Ainesosa",
        isFood: true,
        category: [],
        unit: row.unit || "kpl",
        user: ownership.userId,
        locations: [],
        quantities: { meal: 0, "shopping-list": 0, pantry: 0 },
      })
      await User.findByIdAndUpdate(ownership.userId, {
        $addToSet: { foodItems: personalFood._id },
      })
    }
    mealFoodItems.push({
      foodId: personalFood._id as mongoose.Types.ObjectId,
      quantity: row.quantity,
      unit: row.unit || "kpl",
    })
  }

  const meal = new Meal({
    name: global.name,
    recipe: global.recipe,
    recipeSteps: global.recipeSteps || [],
    difficultyLevel: global.difficultyLevel,
    cookingTime: global.cookingTime,
    defaultRoles: global.defaultRoles,
    mealCategory: global.mealCategory || [],
    plannedEatingDates: [],
    servings: global.servings || 4,
    foodItems: mealFoodItems,
    user: ownership.userId,
    household: ownership.household,
    image: global.image,
  })
  await meal.save()
  await User.findByIdAndUpdate(ownership.userId, {
    $addToSet: { meals: meal._id },
  })
  return { status: "ok", data: meal }
}

export const deleteGlobalFoodItem = async (
  id: string
): Promise<CatalogResult<{ deleted: true }>> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { status: "bad_request", message: "Invalid id" }
  }
  const result = await GlobalFoodItem.findByIdAndDelete(id)
  if (!result) return { status: "not_found", message: "Not found" }
  return { status: "ok", data: { deleted: true } }
}

export const deleteGlobalMeal = async (
  id: string
): Promise<CatalogResult<{ deleted: true }>> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { status: "bad_request", message: "Invalid id" }
  }
  const result = await GlobalMeal.findByIdAndDelete(id)
  if (!result) return { status: "not_found", message: "Not found" }
  return { status: "ok", data: { deleted: true } }
}
