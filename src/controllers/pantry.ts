import { Response } from "express"
import { type Model, Types } from "mongoose"
import type {
  IFoodItem,
  IFoodItemNutrition,
  IFoodItemOpenFoodFacts,
} from "../models/foodItem"
import type { IPantryItem, IPantryLocation, PantryRemovalReason } from "../models/pantry"
import {
  AuthenticatedRequest,
  getErrorMessage,
  resolveModule,
} from "../helpers/controllerUtils"
import {
  getCanonicalPantry,
  applyPantryItemExpirationDate,
} from "../helpers/pantryHelpers"
import {
  findPantryLocation,
  hydratePantryLocations,
  isPantryLocationType,
  locationIdString,
  nextPantryLocationName,
  syncStorageCategoryForLocation,
} from "../helpers/pantryLocations"
import {
  clearExpiredSuggestionsForItem,
  dismissRemovalSuggestionsForItems,
  serializeActiveRemovalSuggestions,
} from "../helpers/pantrySuggestions"
import {
  persistPantrySideEffects,
  resolveLocationFromStorageCategories,
  resolvePantryLocationId,
} from "../services/pantryItemOps"
import { addFoodItemToPantryForUser } from "../services/pantryAdd"
import { getPantryForUser } from "../services/pantryGet"

const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))

interface AddFoodItemToPantryBody {
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

interface UpdatePantryItemBody {
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

export const getPantry = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pantry = await getPantryForUser(req.user)
    res.json({ success: true, pantry })
  } catch (error: unknown) {
    console.error("Error in getPantry:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const addFoodItemToPantry = async (
  req: AuthenticatedRequest<
    Record<string, string>,
    unknown,
    AddFoodItemToPantryBody
  >,
  res: Response
) => {
  try {
    const result = await addFoodItemToPantryForUser(req.user, req.body)
    if (result.status === "bad_request") {
      return res.status(400).json({
        success: false,
        message: result.message,
      })
    }

    res.json({
      success: true,
      pantry: result.pantry,
      foodItem: result.foodItem,
    })
  } catch (error: unknown) {
    console.error("Error in addFoodItemToPantry:", error)
    res.status(400).json({ success: false, error: getErrorMessage(error) })
  }
}

export const updatePantryItem = async (
  req: AuthenticatedRequest<{ itemId: string }, unknown, UpdatePantryItemBody>,
  res: Response
) => {
  try {
    const { itemId } = req.params
    const update = { ...req.body }

    const pantry = await getCanonicalPantry(req.user)
    const item = (pantry.items as Types.DocumentArray<IPantryItem>).id(itemId)

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found in pantry",
      })
    }

    if (
      update.foodId &&
      typeof update.foodId === "object" &&
      update.foodId._id
    ) {
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
          return res.status(400).json({
            success: false,
            message: "Säilytyspaikkaa ei löytynyt",
          })
        }
        item.locationId = resolvedLocationId as typeof item.locationId
        const location = findPantryLocation(pantry, resolvedLocationId)
        if (location) {
          const nextCategories = syncStorageCategoryForLocation(
            Array.isArray(update.category)
              ? update.category
              : item.category,
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

    res.json({ success: true, pantry })
  } catch (error: unknown) {
    res.status(400).json({ success: false, error: getErrorMessage(error) })
  }
}

export const removePantryItem = async (
  req: AuthenticatedRequest<{ itemId: string }>,
  res: Response
) => {
  try {
    const { itemId } = req.params
    if (!Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({
        success: false,
        message: "Virheellinen tuote",
      })
    }

    const pantry = await getCanonicalPantry(req.user)
    const itemObjectId = new Types.ObjectId(itemId)

    await pantry.updateOne({
      $pull: {
        items: { _id: itemObjectId },
        removalSuggestions: { itemId: itemObjectId },
      },
    })

    res.json({ success: true, message: "Item removed from pantry" })
  } catch (error: unknown) {
    res.status(400).json({ success: false, error: getErrorMessage(error) })
  }
}

const pantryResponse = (
  pantry: Awaited<ReturnType<typeof getCanonicalPantry>>
) => ({
  ...pantry.toObject(),
  locations: pantry.locations || [],
  removalSuggestions: serializeActiveRemovalSuggestions(pantry),
})

export const addPantryLocation = async (
  req: AuthenticatedRequest<
    Record<string, string>,
    unknown,
    { type?: string; name?: string }
  >,
  res: Response
) => {
  try {
    const type = req.body.type
    if (!isPantryLocationType(type)) {
      return res.status(400).json({
        success: false,
        message: "Säilytyspaikan tyyppi on pakollinen",
      })
    }

    const pantry = await getCanonicalPantry(req.user)
    persistPantrySideEffects(pantry)
    const name =
      String(req.body.name || "").trim() ||
      nextPantryLocationName(
        type,
        pantry.locations.map((location) => location.name)
      )

    pantry.locations.push({ type, name } as (typeof pantry.locations)[number])
    await pantry.save()

    res.json({ success: true, pantry: pantryResponse(pantry) })
  } catch (error: unknown) {
    res.status(400).json({ success: false, error: getErrorMessage(error) })
  }
}

export const updatePantryLocation = async (
  req: AuthenticatedRequest<
    { locationId: string },
    unknown,
    { type?: string; name?: string }
  >,
  res: Response
) => {
  try {
    const pantry = await getCanonicalPantry(req.user)
    persistPantrySideEffects(pantry)
    const location = findPantryLocation(pantry, req.params.locationId)
    if (!location) {
      return res.status(404).json({
        success: false,
        message: "Säilytyspaikkaa ei löytynyt",
      })
    }

    if (req.body.type !== undefined) {
      if (!isPantryLocationType(req.body.type)) {
        return res.status(400).json({
          success: false,
          message: "Säilytyspaikan tyyppi ei kelpaa",
        })
      }
      location.type = req.body.type
    }
    if (req.body.name !== undefined) {
      const name = String(req.body.name || "").trim()
      if (!name) {
        return res.status(400).json({
          success: false,
          message: "Säilytyspaikan nimi on pakollinen",
        })
      }
      location.name = name
    }

    await pantry.save()
    res.json({ success: true, pantry: pantryResponse(pantry) })
  } catch (error: unknown) {
    res.status(400).json({ success: false, error: getErrorMessage(error) })
  }
}

export const removePantryLocation = async (
  req: AuthenticatedRequest<{ locationId: string }>,
  res: Response
) => {
  try {
    const pantry = await getCanonicalPantry(req.user)
    persistPantrySideEffects(pantry)
    const location = findPantryLocation(pantry, req.params.locationId)
    if (!location) {
      return res.status(404).json({
        success: false,
        message: "Säilytyspaikkaa ei löytynyt",
      })
    }

    const locationId = String(location._id)
    ;(pantry.locations as Types.DocumentArray<IPantryLocation>).pull(locationId)

    for (const item of pantry.items) {
      if (locationIdString(item.locationId) === locationId) {
        item.locationId = null
      }
    }

    pantry.set(
      "removalSuggestions",
      pantry.removalSuggestions.filter(
        (suggestion) => locationIdString(suggestion.locationId) !== locationId
      )
    )

    await pantry.save()
    res.json({ success: true, pantry: pantryResponse(pantry) })
  } catch (error: unknown) {
    res.status(400).json({ success: false, error: getErrorMessage(error) })
  }
}

export const dismissPantryRemovalSuggestions = async (
  req: AuthenticatedRequest<
    Record<string, string>,
    unknown,
    { itemIds?: string[]; reason?: PantryRemovalReason }
  >,
  res: Response
) => {
  try {
    const itemIds = Array.isArray(req.body.itemIds)
      ? req.body.itemIds.map(String).filter(Boolean)
      : []
    if (itemIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Valitse vähintään yksi tuote",
      })
    }

    const reason = req.body.reason
    if (
      reason &&
      reason !== "expired" &&
      reason !== "missing_from_photo"
    ) {
      return res.status(400).json({
        success: false,
        message: "Poistoehdotuksen syy ei kelpaa",
      })
    }

    const pantry = await getCanonicalPantry(req.user)
    persistPantrySideEffects(pantry)
    dismissRemovalSuggestionsForItems(pantry, itemIds, reason)
    await pantry.save()

    res.json({ success: true, pantry: pantryResponse(pantry) })
  } catch (error: unknown) {
    res.status(400).json({ success: false, error: getErrorMessage(error) })
  }
}
