import type { Model } from "mongoose"
import { Types } from "mongoose"
import type { IFoodItem } from "../models/foodItem"
import type { IPantryItem } from "../models/pantry"
import type { IUser } from "../models/user"
import { resolveModule } from "../helpers/controllerUtils"
import {
  applyPantryItemExpirationDate,
  getCanonicalPantry,
} from "../helpers/pantryHelpers"
import {
  findPantryLocation,
  syncStorageCategoryForLocation,
} from "../helpers/pantryLocations"
import { clearExpiredSuggestionsForItem } from "../helpers/pantrySuggestions"
import {
  persistPantrySideEffects,
  resolveLocationFromStorageCategories,
  resolvePantryLocationId,
} from "./pantryItemOps"

const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))

export interface UpdatePantryItemInput {
  foodId?: { _id?: string } | string
  image?: unknown
  category?: string[] | string
  name?: string
  unit?: string
  price?: number
  calories?: number
  quantity?: number
  expirationDate?: string | Date
  expirationDateSetByUser?: boolean
  locationId?: string | null
  [key: string]: unknown
}

export type UpdatePantryItemResult =
  | {
      status: "ok"
      pantry: Awaited<ReturnType<typeof getCanonicalPantry>>
    }
  | { status: "not_found" | "bad_request"; message: string }

export const updatePantryItemForUser = async (
  user: IUser,
  itemId: string,
  body: UpdatePantryItemInput
): Promise<UpdatePantryItemResult> => {
  const update = { ...body }

  const pantry = await getCanonicalPantry(user)
  const item = (pantry.items as Types.DocumentArray<IPantryItem>).id(itemId)

  if (!item) {
    return { status: "not_found", message: "Item not found in pantry" }
  }

  if (update.foodId && typeof update.foodId === "object" && update.foodId._id) {
    item.foodId = update.foodId._id as unknown as typeof item.foodId
    delete update.foodId
  }

  if (update.image) {
    delete update.image
  }

  if (update.locationId !== undefined) {
    if (!update.locationId) {
      item.locationId = null
    } else {
      const resolvedLocationId = resolvePantryLocationId(
        pantry,
        update.locationId
      )
      if (!resolvedLocationId) {
        return { status: "bad_request", message: "Säilytyspaikkaa ei löytynyt" }
      }
      item.locationId = resolvedLocationId as typeof item.locationId
      const location = findPantryLocation(pantry, resolvedLocationId)
      if (location) {
        const nextCategories = syncStorageCategoryForLocation(
          Array.isArray(update.category) ? update.category : item.category,
          location.type
        )
        item.category = nextCategories
        update.category = nextCategories
      }
    }
    delete update.locationId
  } else if (update.category !== undefined) {
    const inferredLocationId = resolveLocationFromStorageCategories(
      pantry,
      Array.isArray(update.category) ? update.category : []
    )
    if (inferredLocationId) {
      item.locationId = inferredLocationId as typeof item.locationId
    }
  }

  if (update.expirationDate !== undefined) {
    applyPantryItemExpirationDate(item, update.expirationDate)
    clearExpiredSuggestionsForItem(pantry, item._id)
    delete update.expirationDate
    delete update.expirationDateSetByUser
  } else if (update.expirationDateSetByUser !== undefined) {
    item.expirationDateSetByUser = Boolean(update.expirationDateSetByUser)
    delete update.expirationDateSetByUser
  }

  Object.assign(item, update)
  persistPantrySideEffects(pantry)
  await pantry.save()

  if (item.foodId) {
    const foodItemUpdate: Partial<IFoodItem> = {}

    if (update.category !== undefined) {
      foodItemUpdate.category = Array.isArray(update.category)
        ? update.category.map((cat) => String(cat))
        : []
    }
    if (update.name !== undefined) foodItemUpdate.name = update.name
    if (update.unit !== undefined) foodItemUpdate.unit = update.unit
    if (update.price !== undefined) foodItemUpdate.price = update.price
    if (update.calories !== undefined) {
      foodItemUpdate.calories = update.calories
    }

    if (Object.keys(foodItemUpdate).length > 0) {
      const foodItemId =
        typeof item.foodId === "object" &&
        item.foodId !== null &&
        "_id" in item.foodId
          ? (item.foodId as unknown as { _id: string })._id
          : item.foodId

      await FoodItem.findByIdAndUpdate(foodItemId, foodItemUpdate, {
        new: true,
      })
    }
  }

  await pantry.populate({ path: "items.foodId" })

  return { status: "ok", pantry }
}
