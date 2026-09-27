import type { Model } from "mongoose"
import type { IUser } from "../models/user"
import type { IFoodItem } from "../models/foodItem"
import type { IPantry } from "../models/pantry"
import type { IShoppingList, IShoppingListItem } from "../models/shoppingList"
import { resolveModule } from "../helpers/controllerUtils"
import {
  getDataQuery,
  getHouseholdMemberIds,
  resolveHouseholdId,
} from "../helpers/householdHelpers"
import { normalizeAppUnit } from "../utils/openFoodFactsMapper"
import { getFoodPriceIndexMultiplier } from "./consumerPriceIndex"
import {
  estimateLinePrice,
  positivePrice,
  roundMoney,
  type EstimateLineInput,
  type FoodPriceSource,
  type HistoryPrice,
  type LinePriceEstimate,
} from "./priceEstimate"

const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))
const Pantry = resolveModule<Model<IPantry>>(require("../models/pantry"))
const ShoppingList = resolveModule<Model<IShoppingList>>(
  require("../models/shoppingList")
)

const idOf = (value: unknown): string => {
  if (!value) return ""
  if (typeof value === "object" && value !== null && "_id" in value) {
    return String((value as { _id: unknown })._id)
  }
  return String(value)
}

const loadHouseholdPriceHistory = async (
  user: IUser
): Promise<HistoryPrice[]> => {
  const householdId = resolveHouseholdId(user)
  const memberIds = householdId ? await getHouseholdMemberIds(householdId) : []
  const foodOwner =
    memberIds.length > 0
      ? { user: { $in: memberIds } }
      : { user: user._id }
  const [foods, pantries, lists] = await Promise.all([
    FoodItem.find({ ...foodOwner, price: { $gt: 0 } })
      .select("name price unit packageQuantity priceSource")
      .lean(),
    Pantry.find(await getDataQuery(user)).select("items").lean(),
    ShoppingList.find(await getDataQuery(user)).select("items").lean(),
  ])

  const history: HistoryPrice[] = []

  for (const food of foods) {
    const price = positivePrice(food.price)
    if (!price) continue
    // FoodItem.price is always one package / one piece price. Shopping-list
    // rows for packaged goods use kpl, so history must match that unit.
    history.push({
      kind: "food",
      foodId: String(food._id),
      name: food.name,
      price,
      quantity: 1,
      unit: "kpl",
      priceSource: food.priceSource as FoodPriceSource | undefined,
    })
  }

  for (const pantry of pantries) {
    for (const item of pantry.items || []) {
      const price = positivePrice(item.price)
      if (!price) continue
      history.push({
        kind: "pantry",
        foodId: idOf(item.foodId) || undefined,
        name: item.name,
        price,
        quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
        unit: normalizeAppUnit(item.unit),
      })
    }
  }

  for (const list of lists) {
    for (const item of list.items || []) {
      const price = positivePrice(item.price)
      if (!price) continue
      history.push({
        kind: "list",
        foodId: idOf(item.foodId) || undefined,
        name: item.name,
        price,
        quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
        unit: normalizeAppUnit(item.unit),
      })
    }
  }

  return history
}

type EstimateItemInput = {
  name?: string
  isFood?: boolean
  quantity?: number | string
  unit?: string
  category?: string[]
  categories?: string[]
  price?: number
  foodId?: unknown
  packageQuantity?: number
  packageUnit?: string
  barcode?: string
}

const cleanBarcode = (value: unknown): string =>
  String(value || "").replace(/[\s-]/g, "")

const attachFoodIdsFromBarcodes = async (
  user: IUser,
  items: EstimateItemInput[]
): Promise<EstimateItemInput[]> => {
  const barcodes = [
    ...new Set(
      items
        .map((item) => cleanBarcode(item.barcode))
        .filter((code) => code.length >= 8)
    ),
  ]
  if (barcodes.length === 0) return items

  const householdId = resolveHouseholdId(user)
  const memberIds = householdId ? await getHouseholdMemberIds(householdId) : []
  const foodOwner =
    memberIds.length > 0
      ? { user: { $in: memberIds } }
      : { user: user._id }

  const foods = await FoodItem.find({
    ...foodOwner,
    "openFoodFactsData.barcode": { $in: barcodes },
  })
    .select(
      "_id name price unit packageQuantity priceSource category openFoodFactsData.barcode"
    )
    .lean()

  const byBarcode = new Map(
    foods.map((food) => [
      cleanBarcode(food.openFoodFactsData?.barcode),
      food,
    ])
  )

  return items.map((item) => {
    const food = byBarcode.get(cleanBarcode(item.barcode))
    if (!food) return item
    return {
      ...item,
      foodId: item.foodId || food._id,
      packageQuantity: item.packageQuantity || food.packageQuantity,
      packageUnit: item.packageUnit || food.unit,
      category:
        (item.category && item.category.length > 0
          ? item.category
          : item.categories && item.categories.length > 0
            ? item.categories
            : food.category) || [],
    }
  })
}

const toEstimateInput = (item: EstimateItemInput): EstimateLineInput => {
  const food = item.foodId
  const populated =
    food && typeof food === "object"
      ? (food as {
          _id?: unknown
          packageQuantity?: number
          unit?: string
          category?: string[]
        })
      : null
  return {
    name: item.name || "",
    isFood: item.isFood !== false,
    quantity: item.quantity as number,
    unit: item.unit,
    category: item.category || item.categories || populated?.category || [],
    price: item.price,
    foodId: idOf(item.foodId) || undefined,
    packageQuantity: item.packageQuantity || populated?.packageQuantity,
    packageUnit: item.packageUnit || populated?.unit,
  }
}

export interface EstimatedShoppingLine extends EstimateLineInput {
  priceEstimate?: number
  priceEstimateSource?: LinePriceEstimate["priceEstimateSource"]
  priceFromOpenPrices?: boolean
}

const attachFoodDetailsById = async (
  user: IUser,
  items: EstimateItemInput[]
): Promise<EstimateItemInput[]> => {
  const ids = [
    ...new Set(
      items
        .map((item) => idOf(item.foodId))
        .filter((id) => Boolean(id) && id.length >= 8)
    ),
  ]
  if (ids.length === 0) return items

  const householdId = resolveHouseholdId(user)
  const memberIds = householdId ? await getHouseholdMemberIds(householdId) : []
  const foodOwner =
    memberIds.length > 0
      ? { user: { $in: memberIds } }
      : { user: user._id }

  const foods = await FoodItem.find({
    ...foodOwner,
    _id: { $in: ids },
  })
    .select("_id packageQuantity unit category price priceSource")
    .lean()

  const byId = new Map(foods.map((food) => [String(food._id), food]))

  return items.map((item) => {
    const food = byId.get(idOf(item.foodId))
    if (!food) return item
    return {
      ...item,
      packageQuantity: item.packageQuantity || food.packageQuantity,
      packageUnit: item.packageUnit || food.unit,
      category:
        (item.category && item.category.length > 0
          ? item.category
          : item.categories && item.categories.length > 0
            ? item.categories
            : food.category) || [],
    }
  })
}

export const estimateShoppingListItems = async (
  user: IUser,
  items: EstimateItemInput[]
): Promise<EstimatedShoppingLine[]> => {
  const withBarcodes = await attachFoodIdsFromBarcodes(user, items)
  const resolved = await attachFoodDetailsById(user, withBarcodes)
  const needsHistory = resolved.some((item) => !(positivePrice(item.price) > 0))
  const [history, cpiMultiplier] = needsHistory
    ? await Promise.all([
        loadHouseholdPriceHistory(user),
        getFoodPriceIndexMultiplier(),
      ])
    : [[], 1]

  return resolved.map((item) => {
    const input = toEstimateInput(item)
    if (positivePrice(input.price) > 0) {
      return { ...input, price: positivePrice(input.price) }
    }
    const estimate = estimateLinePrice(input, { history, cpiMultiplier })
    if (!estimate) return input
    return {
      ...input,
      priceEstimate: estimate.priceEstimate,
      priceEstimateSource: estimate.priceEstimateSource,
      priceFromOpenPrices: estimate.priceFromOpenPrices,
    }
  })
}

export const applyEstimatesToShoppingItems = async (
  user: IUser,
  items: IShoppingListItem[]
): Promise<void> => {
  const clearUserPricedEstimates = () => {
    items.forEach((item) => {
      if (positivePrice(item.price) > 0) {
        item.priceEstimate = undefined
        item.priceEstimateSource = undefined
      }
    })
  }

  // Client previews and scaled duplicate merges already carry a line total.
  // Recalculate only rows that arrived without one. A user price still wins.
  const needsEstimate = items.some(
    (item) =>
      !(positivePrice(item.price) > 0) &&
      !(positivePrice(item.priceEstimate) > 0)
  )
  if (!needsEstimate) {
    clearUserPricedEstimates()
    return
  }

  const estimated = await estimateShoppingListItems(user, items)
  items.forEach((item, index) => {
    const next = estimated[index]
    if (positivePrice(item.price) > 0) {
      item.priceEstimate = undefined
      item.priceEstimateSource = undefined
      return
    }
    if (positivePrice(item.priceEstimate) > 0) return
    if (next && positivePrice(next.priceEstimate) > 0) {
      item.priceEstimate = next.priceEstimate
      item.priceEstimateSource = next.priceEstimateSource
      return
    }
    item.priceEstimate = undefined
    item.priceEstimateSource = undefined
  })
}

export const rememberUserPriceOnFoodItem = async (
  foodId: unknown,
  price: number,
  options: { quantity?: number | string; unit?: string } = {}
): Promise<void> => {
  const id = idOf(foodId)
  if (!id || !(price > 0)) return
  // Shopping-list price is a row total; store the per-package / per-piece price.
  let stored = price
  const quantity = Number(options.quantity)
  const unit = normalizeAppUnit(options.unit)
  if (unit === "kpl" && Number.isFinite(quantity) && quantity > 0) {
    stored = roundMoney(price / quantity)
  }
  await FoodItem.updateOne(
    { _id: id },
    { $set: { price: stored, priceSource: "user" } }
  )
}
