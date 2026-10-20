import type { Model } from "mongoose"
import type {
  IFoodItem,
  IFoodItemNutrition,
  IFoodItemOpenFoodFacts,
} from "../models/foodItem"
import type { IPantryItem } from "../models/pantry"
import type { IUser } from "../models/user"
import { resolveModule } from "../helpers/controllerUtils"
import {
  getCanonicalPantry,
  pantryItemMergeKey,
} from "../helpers/pantryHelpers"
import {
  findPantryLocation,
  itemLocationKey,
  syncStorageCategoryForLocation,
} from "../helpers/pantryLocations"
import { clearExpiredSuggestionsForItem } from "../helpers/pantrySuggestions"
import {
  getHouseholdMemberIds,
  resolveHouseholdId,
} from "../helpers/householdHelpers"
import { normalizeAppUnit } from "../utils/openFoodFactsMapper"
import { fillFoodItemPriceFromOpenPrices } from "./openPrices"
import {
  applyPantryScanMetadata,
  parsePantryQuantity,
  persistPantrySideEffects,
  resolveLocationFromStorageCategories,
  resolvePantryLocationId,
} from "./pantryItemOps"

const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))

export interface AddFoodItemToPantryInput {
  name?: string
  category?: string[]
  quantity?: number | string
  unit?: string
  price?: number
  calories?: number
  nutrition?: IFoodItemNutrition
  expirationDate?: string | Date
  expirationDateSetByUser?: boolean
  locationId?: string | null
  foodId?: string
  imageUrl?: string
  barcode?: string
  openFoodFactsData?: IFoodItemOpenFoodFacts
}

export type AddFoodItemToPantryResult =
  | {
      status: "ok"
      pantry: Awaited<ReturnType<typeof getCanonicalPantry>>
      foodItem: IFoodItem
    }
  | { status: "bad_request"; message: string }

export const addFoodItemToPantryForUser = async (
  user: IUser,
  body: AddFoodItemToPantryInput
): Promise<AddFoodItemToPantryResult> => {
  const {
    name,
    category,
    quantity,
    unit,
    price,
    calories,
    nutrition,
    expirationDate,
    expirationDateSetByUser,
    locationId,
    foodId,
    imageUrl,
    barcode,
    openFoodFactsData,
  } = body

  if (!name?.trim() && !foodId) {
    return { status: "bad_request", message: "Valid item name is required" }
  }

  const pantryQty = parsePantryQuantity(quantity)
  const normalizedName = name?.trim() || ""
  const householdId = resolveHouseholdId(user)
  const memberIds = householdId ? await getHouseholdMemberIds(householdId) : []
  const ownerQuery =
    memberIds.length > 0
      ? { user: { $in: memberIds } }
      : { user: user._id }

  let foodItem = foodId
    ? await FoodItem.findOne({ _id: foodId, ...ownerQuery })
    : null

  if (
    foodItem &&
    normalizedName &&
    pantryItemMergeKey(foodItem.name) !== pantryItemMergeKey(normalizedName)
  ) {
    foodItem = null
  }

  if (!foodItem && normalizedName) {
    foodItem = await FoodItem.findOne({
      ...ownerQuery,
      name: new RegExp(
        `^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        "i"
      ),
    })
  }

  if (!foodItem) {
    if (!normalizedName) {
      return { status: "bad_request", message: "Valid item name is required" }
    }

    const userPrice = Number(price) > 0 ? Number(price) : 0
    foodItem = new FoodItem({
      name: normalizedName,
      category: category || [],
      unit: unit || "kpl",
      price: userPrice,
      priceSource: userPrice > 0 ? "user" : undefined,
      calories,
      nutrition,
      user: user._id,
      locations: [],
      quantities: {
        meal: 0,
        "shopping-list": 0,
        pantry: 0,
      },
    })
    applyPantryScanMetadata(foodItem, {
      imageUrl,
      barcode,
      openFoodFactsData,
      nutrition,
    })
    await fillFoodItemPriceFromOpenPrices(foodItem)
    await foodItem.save()
  } else {
    if (category) foodItem.category = category
    if (!foodItem.unit && unit) foodItem.unit = unit
    if (price !== undefined && Number(price) > 0) {
      foodItem.price = Number(price)
      foodItem.priceSource = "user"
    }
    if (calories !== undefined) foodItem.calories = calories
    if (nutrition) {
      foodItem.nutrition = {
        ...(foodItem.nutrition || {}),
        ...nutrition,
      }
    }
    applyPantryScanMetadata(foodItem, {
      imageUrl,
      barcode,
      openFoodFactsData,
      nutrition,
    })
    await fillFoodItemPriceFromOpenPrices(foodItem)
    await foodItem.save()
  }

  const pantry = await getCanonicalPantry(user)
  persistPantrySideEffects(pantry)
  const rowUnit = normalizeAppUnit(unit || foodItem.unit || "kpl")
  const displayName = normalizedName || foodItem.name
  const rowNameKey = pantryItemMergeKey(displayName)
  let resolvedLocationId = resolvePantryLocationId(pantry, locationId)
  if (locationId && !resolvedLocationId) {
    return { status: "bad_request", message: "Säilytyspaikkaa ei löytynyt" }
  }
  if (!resolvedLocationId) {
    resolvedLocationId = resolveLocationFromStorageCategories(pantry, [
      ...(category || []),
      ...(foodItem.category || []),
    ])
  }
  const location = findPantryLocation(pantry, resolvedLocationId)
  const rowCategories = location
    ? syncStorageCategoryForLocation(foodItem.category, location.type)
    : foodItem.category
  if (
    location &&
    rowCategories.join("\0") !== (foodItem.category || []).join("\0")
  ) {
    foodItem.category = rowCategories
    await foodItem.save()
  }
  const rowLocationKey = itemLocationKey({
    locationId: resolvedLocationId,
  } as IPantryItem)
  const userSetExpiration =
    Boolean(expirationDate) || Boolean(expirationDateSetByUser)

  const existingItem = pantry.items.find((item) => {
    if (normalizeAppUnit(item.unit) !== rowUnit) return false
    if (itemLocationKey(item) !== rowLocationKey) return false
    const itemNameKey = pantryItemMergeKey(item.name)
    if (itemNameKey && itemNameKey === rowNameKey) return true
    return (
      !itemNameKey &&
      Boolean(foodItem._id) &&
      item.foodId?.toString() === foodItem._id.toString()
    )
  })

  if (existingItem) {
    existingItem.quantity += pantryQty
    existingItem.unit = rowUnit
    existingItem.category = rowCategories
    existingItem.calories = foodItem.calories || 0
    existingItem.price = foodItem.price || 0
    existingItem.foodId = foodItem._id
    existingItem.name = displayName
    if (resolvedLocationId) {
      existingItem.locationId =
        resolvedLocationId as typeof existingItem.locationId
    }
    if (expirationDate) {
      existingItem.expirationDate = new Date(expirationDate)
      existingItem.expirationDateSetByUser = true
      clearExpiredSuggestionsForItem(pantry, existingItem._id)
    }
  } else {
    pantry.items.push({
      foodId: foodItem._id,
      name: displayName,
      quantity: pantryQty,
      unit: rowUnit,
      category: rowCategories,
      calories: foodItem.calories || 0,
      price: foodItem.price || 0,
      locationId: resolvedLocationId,
      ...(userSetExpiration && expirationDate
        ? {
            expirationDate: new Date(expirationDate),
            expirationDateSetByUser: true,
          }
        : { expirationDateSetByUser: false }),
      addedFrom: "pantry",
    } as IPantryItem)
  }

  await pantry.save()

  return { status: "ok", pantry, foodItem }
}
