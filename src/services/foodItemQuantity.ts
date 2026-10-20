import type { Model } from "mongoose"
import type { IFoodItem, FoodLocation } from "../models/foodItem"
import type { IPantryItem } from "../models/pantry"
import type { IUser } from "../models/user"
import { getCanonicalPantry } from "../helpers/pantryHelpers"
import { resolveModule } from "../helpers/controllerUtils"
import { FOOD_LOCATIONS } from "./foodItemFields"

const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))

export type QuantityAction = "add" | "subtract" | "set"

export type FoodItemQuantityResult =
  | { status: "ok"; foodItem: IFoodItem; message: string }
  | { status: "bad_request"; message: string }

const applyQuantityAction = (
  current: number,
  quantity: number,
  action: QuantityAction
): number | null => {
  switch (action) {
    case "add":
      return current + quantity
    case "subtract":
      return Math.max(0, current - quantity)
    case "set":
      return Math.max(0, quantity)
    default:
      return null
  }
}

export const updateFoodItemQuantity = async (
  user: IUser,
  foodItemId: string,
  location: FoodLocation,
  quantity: number,
  action: QuantityAction = "set"
): Promise<FoodItemQuantityResult> => {
  if (!FOOD_LOCATIONS.includes(location)) {
    return { status: "bad_request", message: "Invalid location" }
  }

  const foodItem = await FoodItem.findOne({
    _id: foodItemId,
    user: user._id,
  })

  if (!foodItem) {
    return { status: "bad_request", message: "Food item not found" }
  }

  if (location === "pantry") {
    const pantry = await getCanonicalPantry(user)
    const row = pantry.items.find(
      (item) => String(item.foodId) === String(foodItem._id)
    )
    if (!row) {
      return { status: "bad_request", message: "Item not found in pantry" }
    }

    const next = applyQuantityAction(Number(row.quantity) || 0, quantity, action)
    if (next == null) {
      return { status: "bad_request", message: "Invalid action" }
    }
    row.quantity = next
    await pantry.save()
    return {
      status: "ok",
      foodItem,
      message: `Quantity ${action}ed in pantry`,
    }
  }

  const next = applyQuantityAction(
    foodItem.quantities[location],
    quantity,
    action
  )
  if (next == null) {
    return { status: "bad_request", message: "Invalid action" }
  }
  foodItem.quantities[location] = next
  await foodItem.save()

  return {
    status: "ok",
    foodItem,
    message: `Quantity ${action}ed in ${location}`,
  }
}

export const moveFoodItemQuantity = async (
  user: IUser,
  foodItemId: string,
  fromLocation: FoodLocation,
  toLocation: FoodLocation,
  quantity: number
): Promise<FoodItemQuantityResult> => {
  if (
    !FOOD_LOCATIONS.includes(fromLocation) ||
    !FOOD_LOCATIONS.includes(toLocation)
  ) {
    return { status: "bad_request", message: "Invalid location" }
  }

  if (fromLocation === toLocation) {
    return {
      status: "bad_request",
      message: "Source and destination must be different",
    }
  }

  const foodItem = await FoodItem.findOne({
    _id: foodItemId,
    user: user._id,
  })

  if (!foodItem) {
    return { status: "bad_request", message: "Food item not found" }
  }

  const usesPantry = fromLocation === "pantry" || toLocation === "pantry"
  const pantry = usesPantry ? await getCanonicalPantry(user) : null

  if (usesPantry && !pantry) {
    return { status: "bad_request", message: "Pantry not available" }
  }

  if (fromLocation === "pantry") {
    if (!pantry) {
      return { status: "bad_request", message: "Pantry not available" }
    }
    const row = pantry.items.find(
      (item) => String(item.foodId) === String(foodItem._id)
    )
    if (!row) {
      return { status: "bad_request", message: "Item not found in pantry" }
    }
    const available = Number(row.quantity) || 0
    if (available < quantity) {
      return {
        status: "bad_request",
        message: "Not enough quantity in pantry",
      }
    }
    row.quantity = available - quantity
  } else if (foodItem.quantities[fromLocation] < quantity) {
    return {
      status: "bad_request",
      message: `Not enough quantity in ${fromLocation}`,
    }
  } else {
    foodItem.quantities[fromLocation] -= quantity
  }

  if (toLocation === "pantry") {
    if (!pantry) {
      return { status: "bad_request", message: "Pantry not available" }
    }
    const row = pantry.items.find(
      (item) => String(item.foodId) === String(foodItem._id)
    )
    if (row) {
      row.quantity = (Number(row.quantity) || 0) + quantity
    } else {
      pantry.items.push({
        foodId: foodItem._id,
        name: foodItem.name,
        quantity,
        unit: foodItem.unit || "kpl",
        category: foodItem.category || [],
        calories: foodItem.calories || 0,
        price: foodItem.price || 0,
        addedFrom: "pantry",
      } as IPantryItem)
    }
  } else {
    foodItem.quantities[toLocation] += quantity
  }

  // Catalog must not keep pantry stock; that lives on the Pantry document.
  if (usesPantry) {
    foodItem.quantities.pantry = 0
  }

  if (pantry) {
    await pantry.save()
  }
  await foodItem.save()

  return {
    status: "ok",
    foodItem,
    message: `Moved ${quantity} from ${fromLocation} to ${toLocation}`,
  }
}
