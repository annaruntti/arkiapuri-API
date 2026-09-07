import { Response } from "express"
import type { Model, Types } from "mongoose"
import type { IFoodItem, IFoodItemNutrition, IFoodItemOpenFoodFacts } from "../models/foodItem"
import type { IPantryItem, IPantryLocation, PantryRemovalReason } from "../models/pantry"
import {
  AuthenticatedRequest,
  getErrorMessage,
  parseQuantity,
  resolveModule,
  sanitizeBarcode,
  sanitizeHttpUrl,
} from "../helpers/controllerUtils"
import {
  getCanonicalPantry,
  mergeDuplicatePantryItems,
  mergeProcessedPantryItems,
  pantryItemMergeKey,
  depopulatePantryFoodIds,
  applyPantryItemExpirationDate,
} from "../helpers/pantryHelpers"
import {
  findFirstLocationOfType,
  findPantryLocation,
  hydratePantryLocations,
  inferLocationTypeFromCategories,
  isPantryLocationType,
  itemLocationKey,
  locationIdString,
  nextPantryLocationName,
  syncStorageCategoryForLocation,
} from "../helpers/pantryLocations"
import {
  clearExpiredSuggestionsForItem,
  dismissRemovalSuggestionsForItems,
  pruneStaleRemovalSuggestions,
  serializeActiveRemovalSuggestions,
  syncExpiredRemovalSuggestions,
} from "../helpers/pantrySuggestions"
import {
  getHouseholdMemberIds,
  resolveHouseholdId,
} from "../helpers/householdHelpers"
import { normalizeAppUnit } from "../utils/openFoodFactsMapper"

const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))

const applyPantryScanMetadata = (
  foodItem: IFoodItem,
  data: {
    imageUrl?: string
    barcode?: string
    openFoodFactsData?: IFoodItemOpenFoodFacts
    nutrition?: IFoodItemNutrition
  }
) => {
  const imageUrl = sanitizeHttpUrl(
    data.imageUrl || data.openFoodFactsData?.imageUrl
  )
  if (imageUrl && !foodItem.image?.url) {
    foodItem.image = { url: imageUrl }
  }

  const barcode = sanitizeBarcode(
    data.barcode || data.openFoodFactsData?.barcode
  )
  if (!imageUrl && !barcode && !data.openFoodFactsData) return

  const offData = data.openFoodFactsData
  const {
    imageUrl: _offImage,
    barcode: _offBarcode,
    nutrition: offNutrition,
    ...offRest
  } = offData || {}

  foodItem.openFoodFactsData = {
    ...(foodItem.openFoodFactsData || {}),
    ...offRest,
    ...(barcode ? { barcode } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    nutrition: {
      ...(foodItem.openFoodFactsData?.nutrition || {}),
      ...(offNutrition || {}),
      ...(data.nutrition || {}),
    },
    lastUpdated: new Date(),
  }
}

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

const parsePantryQuantity = (value: number | string | undefined): number =>
  parseQuantity(value, { fallback: 1, min: 0 })

const resolvePantryLocationId = (
  pantry: Awaited<ReturnType<typeof getCanonicalPantry>>,
  locationId: unknown
) => {
  if (locationId == null || locationId === "") return null
  const location = findPantryLocation(pantry, locationId)
  return location?._id ?? null
}

const persistPantrySideEffects = (
  pantry: Awaited<ReturnType<typeof getCanonicalPantry>>
): boolean => {
  const locationsHydrated = hydratePantryLocations(pantry)
  const pruned = pruneStaleRemovalSuggestions(pantry)
  const expiredSynced = syncExpiredRemovalSuggestions(pantry)
  return locationsHydrated || pruned || expiredSynced
}

const resolveLocationFromStorageCategories = (
  pantry: Awaited<ReturnType<typeof getCanonicalPantry>>,
  categories: unknown[] | undefined
) => {
  const type = inferLocationTypeFromCategories(categories)
  if (!type) return null
  return findFirstLocationOfType(pantry, type)?._id ?? null
}

export const getPantry = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Pantry collection is the only source of truth for pantry contents.
    const pantry = await getCanonicalPantry(req.user)
    await pantry.populate({ path: "items.foodId" })

    // Normalize units only; do not overwrite names from food items
    // (that can split same-looking pantry rows into different merge keys).
    let touched = false
    for (const item of pantry.items) {
      const normalizedUnit = normalizeAppUnit(item.unit)
      if (item.unit !== normalizedUnit) {
        item.unit = normalizedUnit
        touched = true
      }
      if (!item.name?.trim()) {
        const foodItemData =
          item.foodId && typeof item.foodId === "object"
            ? (item.foodId as unknown as Partial<IFoodItem>)
            : null
        if (foodItemData?.name) {
          item.name = foodItemData.name
          touched = true
        }
      }
    }

    const hydrated = hydratePantryLocations(pantry)
    const merged = mergeDuplicatePantryItems(pantry)
    const pruned = pruneStaleRemovalSuggestions(pantry)
    const expiredSynced = syncExpiredRemovalSuggestions(pantry)
    if (hydrated || merged || touched || pruned || expiredSynced) {
      depopulatePantryFoodIds(pantry)
      await pantry.save()
      await pantry.populate({ path: "items.foodId" })
    }

    const processedItems = mergeProcessedPantryItems(
      pantry.items.map((item) => {
        const foodItemData =
          item.foodId &&
          typeof item.foodId === "object" &&
          item.foodId !== null &&
          "name" in (item.foodId as object)
            ? (item.foodId as unknown as Partial<IFoodItem>)
            : {}
        const raw =
          typeof item.toObject === "function" ? item.toObject() : { ...item }
        // Prefer the pantry row's own unit — foodItem.unit may be a package
        // default (e.g. g) while the row stores what the user bought (e.g. kpl).
        return {
          ...raw,
          name: (item.name || foodItemData.name || "Nimetön tuote").trim(),
          category: foodItemData.category || item.category || [],
          unit: normalizeAppUnit(item.unit || foodItemData.unit),
          calories: foodItemData.calories || item.calories || 0,
          price: foodItemData.price || item.price || 0,
          locationId: locationIdString(item.locationId),
          image:
            foodItemData.image ||
            (foodItemData.openFoodFactsData?.imageUrl
              ? { url: foodItemData.openFoodFactsData.imageUrl }
              : null),
        }
      })
    )

    const pantryObject = pantry.toObject()
    res.json({
      success: true,
      pantry: {
        ...pantryObject,
        items: processedItems,
        locations: pantryObject.locations || [],
        removalSuggestions: serializeActiveRemovalSuggestions(pantry),
      },
    })
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
    } = req.body

    if (!name?.trim() && !foodId) {
      return res.status(400).json({
        success: false,
        message: "Valid item name is required",
      })
    }

    const pantryQty = parsePantryQuantity(quantity)
    const normalizedName = name?.trim() || ""
    const householdId = resolveHouseholdId(req.user)
    const memberIds = householdId
      ? await getHouseholdMemberIds(householdId)
      : []
    const ownerQuery =
      memberIds.length > 0
        ? { user: { $in: memberIds } }
        : { user: req.user._id }

    let foodItem = foodId
      ? await FoodItem.findOne({ _id: foodId, ...ownerQuery })
      : null

    // Ignore a stale catalog id when the submitted name is a different product
    // (e.g. scan matched "Kivennäisvesi", user renamed to "Novelle kivennäisvesi").
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
        return res.status(400).json({
          success: false,
          message: "Valid item name is required",
        })
      }

      foodItem = new FoodItem({
        name: normalizedName,
        category: category || [],
        unit: unit || "kpl",
        price,
        calories,
        nutrition,
        user: req.user._id,
        locations: [],
        quantities: {
          meal: 0,
          "shopping-list": 0,
          pantry: 0,
        },
      })
      applyPantryScanMetadata(foodItem, { imageUrl, barcode, openFoodFactsData, nutrition })
      await foodItem.save()
    } else {
      if (category) foodItem.category = category
      if (!foodItem.unit && unit) foodItem.unit = unit
      if (price !== undefined) foodItem.price = price
      if (calories !== undefined) foodItem.calories = calories
      if (nutrition) {
        foodItem.nutrition = {
          ...(foodItem.nutrition || {}),
          ...nutrition,
        }
      }
      applyPantryScanMetadata(foodItem, { imageUrl, barcode, openFoodFactsData, nutrition })
      await foodItem.save()
    }

    const pantry = await getCanonicalPantry(req.user)
    persistPantrySideEffects(pantry)
    const rowUnit = normalizeAppUnit(unit || foodItem.unit || "kpl")
    const displayName = normalizedName || foodItem.name
    const rowNameKey = pantryItemMergeKey(displayName)
    let resolvedLocationId = resolvePantryLocationId(pantry, locationId)
    if (locationId && !resolvedLocationId) {
      return res.status(400).json({
        success: false,
        message: "Säilytyspaikkaa ei löytynyt",
      })
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
    if (location && rowCategories.join("\0") !== (foodItem.category || []).join("\0")) {
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
      // Same catalog id only when the pantry row has no name of its own.
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
        existingItem.locationId = resolvedLocationId as typeof existingItem.locationId
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

    res.json({
      success: true,
      pantry,
      foodItem,
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
    const pantry = await getCanonicalPantry(req.user)

    ;(pantry.items as Types.DocumentArray<IPantryItem>).pull(itemId)
    pantry.removalSuggestions = pantry.removalSuggestions.filter(
      (suggestion) => String(suggestion.itemId) !== String(itemId)
    )
    pantry.markModified("removalSuggestions")
    await pantry.save()

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
