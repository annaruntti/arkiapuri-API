import type { Model } from "mongoose"
import type { IFoodItem } from "../models/foodItem"
import type { IUser } from "../models/user"
import { resolveModule } from "../helpers/controllerUtils"
import {
  applyMappedOpenFoodFactsToFoodItem,
  mapOpenFoodFactsToFoodItemFields,
  normalizeAppUnit,
} from "../utils/openFoodFactsMapper"
import { fillFoodItemPriceFromOpenPrices } from "./openPrices"
import openFoodFactsService from "./openFoodFactsService"

const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))

export type AddOffToFoodItemsInput = {
  barcode?: string
  location?: string
  quantity?: number | string
  unit?: string
  shoppingListId?: string | null
  mealId?: string | null
}

export type AddOffToFoodItemsResult =
  | {
      status: "ok"
      message: string
      foodItem: IFoodItem
      fromOpenFoodFacts: true
      openFoodFactsData?: unknown
      collectionData: {
        location: string
        quantity: number
        unit: string
        shoppingListId: string | null
        mealId: string | null
      }
    }
  | {
      status: "bad_request" | "not_found"
      message: string
    }

/**
 * Resolve collection quantity/unit for OFF → shopping-list / pantry / meal.
 */
export const resolveOffCollectionQuantity = ({
  location,
  unit,
  quantity,
  mapped,
}: {
  location: string
  unit?: string
  quantity?: number | string
  mapped: ReturnType<typeof mapOpenFoodFactsToFoodItemFields>
}) => {
  const foodUnit = mapped.unit || normalizeAppUnit(unit)
  const foodPackageQuantity =
    Number(mapped.packageQuantity) > 0 ? Number(mapped.packageQuantity) : 1
  const clientSentDefaultUnit = !unit || unit === "pcs" || unit === "kpl"
  const requestedQuantity = parseFloat(String(quantity))
  const hasValidRequestedQuantity =
    Number.isFinite(requestedQuantity) && requestedQuantity > 0
  const packagedProduct = foodUnit !== "kpl" && foodPackageQuantity > 0

  let collectionUnit: string
  let collectionQuantity: number
  if (location === "shopping-list" && packagedProduct) {
    collectionUnit = "kpl"
    collectionQuantity = hasValidRequestedQuantity ? requestedQuantity : 1
  } else {
    // Client search hits often lack product_quantity and misparse labels like
    // "4 kpl, 350 g" as 4 kpl. This endpoint re-fetches by barcode, so its
    // mapped package size is authoritative whenever the client only sent a
    // default piece unit (kpl/pcs) while OFF has a real mass/volume package.
    const preferOffPackage =
      clientSentDefaultUnit &&
      (mapped.unit !== "kpl" ||
        !hasValidRequestedQuantity ||
        requestedQuantity === 1)
    collectionUnit = preferOffPackage ? mapped.unit : normalizeAppUnit(unit)
    collectionQuantity = preferOffPackage
      ? mapped.packageQuantity
      : hasValidRequestedQuantity
        ? requestedQuantity
        : mapped.packageQuantity || 1
  }

  return { foodUnit, foodPackageQuantity, collectionUnit, collectionQuantity }
}

/**
 * Find or create a catalog food item from an Open Food Facts barcode.
 */
export const addOpenFoodFactsToFoodItems = async (
  user: IUser,
  input: AddOffToFoodItemsInput
): Promise<AddOffToFoodItemsResult> => {
  const {
    barcode,
    location = "shopping-list",
    quantity = 1,
    unit = "pcs",
    shoppingListId = null,
    mealId = null,
  } = input

  if (!barcode) {
    return { status: "bad_request", message: "Barcode is required" }
  }

  if (!["meal", "shopping-list", "pantry"].includes(location)) {
    return { status: "bad_request", message: "Invalid location" }
  }

  const cleanBarcode = openFoodFactsService.cleanBarcode(barcode)
  const offProduct = await openFoodFactsService.searchByBarcode(cleanBarcode)

  if (!offProduct) {
    return {
      status: "not_found",
      message: "Product not found in Open Food Facts database",
    }
  }

  const existingFoodItem = await FoodItem.findOne({
    user: user._id,
    name: offProduct.name,
  })

  const mapped = mapOpenFoodFactsToFoodItemFields(offProduct)
  const { foodUnit, foodPackageQuantity, collectionUnit, collectionQuantity } =
    resolveOffCollectionQuantity({ location, unit, quantity, mapped })

  const collectionData = {
    location,
    quantity: collectionQuantity,
    unit: collectionUnit,
    shoppingListId,
    mealId,
  }

  if (existingFoodItem) {
    applyMappedOpenFoodFactsToFoodItem(existingFoodItem, mapped, "merge")
    await fillFoodItemPriceFromOpenPrices(existingFoodItem)
    await existingFoodItem.save()

    return {
      status: "ok",
      message: "Product quantity updated",
      foodItem: existingFoodItem,
      fromOpenFoodFacts: true,
      collectionData,
    }
  }

  const foodItem = new FoodItem({
    name: mapped.name,
    category: mapped.category,
    unit: foodUnit,
    packageQuantity: foodPackageQuantity,
    calories: mapped.calories,
    user: user._id,
    image: mapped.image,
    quantities: {
      meal: 0,
      "shopping-list": 0,
      pantry: 0,
    },
    openFoodFactsData: mapped.openFoodFactsData,
  })
  await fillFoodItemPriceFromOpenPrices(foodItem)
  await foodItem.save()

  return {
    status: "ok",
    message: "Product added from Open Food Facts",
    foodItem,
    fromOpenFoodFacts: true,
    openFoodFactsData: offProduct,
    collectionData,
  }
}
