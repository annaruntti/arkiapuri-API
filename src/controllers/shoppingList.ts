import { Response } from "express"
import type { Model } from "mongoose"
import type { IFoodItem } from "../models/foodItem"
import type { IPantryItem } from "../models/pantry"
import type { IShoppingList, IShoppingListItem } from "../models/shoppingList"
import {
  AuthenticatedRequest,
  getErrorMessage,
  parseQuantity,
  resolveModule,
} from "../helpers/controllerUtils"
import {
  getDataOwnership,
  getDataQuery,
} from "../helpers/householdHelpers"
import {
  getCanonicalPantry,
  mergeDuplicatePantryItems,
  pantryItemMergeKey,
} from "../helpers/pantryHelpers"
import {
  findFirstLocationOfType,
  hydratePantryLocations,
  inferLocationTypeFromCategories,
  itemLocationKey,
  syncStorageCategoryForLocation,
} from "../helpers/pantryLocations"
import { normalizeAppUnit } from "../utils/openFoodFactsMapper"
import {
  applyEstimatesToShoppingItems,
  estimateShoppingListItems,
  rememberUserPriceOnFoodItem,
} from "../services/priceEstimateService"
import {
  positivePrice,
  shoppingListDisplayTotal,
} from "../services/priceEstimate"

const ShoppingList = resolveModule<Model<IShoppingList>>(
  require("../models/shoppingList")
)
const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))

interface ShoppingListItemInput {
  _id?: string
  foodId?: string
  name: string
  isFood?: boolean
  estimatedPrice?: number
  quantity?: number | string
  unit?: string
  category?: string[]
  categories?: string[]
  calories?: number
  price?: number
  priceEstimate?: number
  priceEstimateSource?: "history" | "category"
  location?: string
  bought?: boolean
}

interface CreateShoppingListBody {
  name: string
  description?: string
  items: ShoppingListItemInput[]
  totalEstimatedPrice?: number
}

const FOOD_ITEM_SELECT =
  "name category unit packageQuantity calories price priceSource image openFoodFactsData isFood"

const resolveIsFood = (value: unknown, fallback = true): boolean => {
  if (value === false || value === "false") return false
  if (value === true || value === "true") return true
  return fallback
}

const shoppingListAccessQuery = async (
  user: AuthenticatedRequest["user"],
  listId: string
) => ({
  $and: [{ _id: listId }, await getDataQuery(user)],
})

const resolveItemFoodId = (
  foodId: unknown
): IShoppingListItem["foodId"] | undefined => {
  if (!foodId) return undefined
  if (typeof foodId === "object" && foodId !== null && "_id" in foodId) {
    return (foodId as { _id: unknown })._id as IShoppingListItem["foodId"]
  }
  return foodId as IShoppingListItem["foodId"]
}

const mapShoppingListItem = (
  item: ShoppingListItemInput
): Partial<IShoppingListItem> => {
  const parsedQuantity = parseQuantity(item.quantity)
  const foodId = resolveItemFoodId(item.foodId)
  const isFood = resolveIsFood(item.isFood, true)

  return {
    ...(item._id ? { _id: item._id } : {}),
    ...(foodId ? { foodId } : {}),
    name: item.name,
    isFood,
    estimatedPrice: item.estimatedPrice,
    quantity: parsedQuantity,
    unit: normalizeAppUnit(item.unit),
    category: isFood ? item.category || item.categories || [] : [],
    calories: isFood ? item.calories || 0 : 0,
    price: positivePrice(item.price),
    ...(positivePrice(item.priceEstimate) > 0
      ? {
          priceEstimate: positivePrice(item.priceEstimate),
          priceEstimateSource:
            item.priceEstimateSource === "category" ? "category" : "history",
        }
      : {}),
    bought: item.bought !== undefined ? Boolean(item.bought) : false,
  } as unknown as Partial<IShoppingListItem>
}

const mergeFoodIdIntoItems = (list: {
  items: Array<Record<string, unknown>>
}) => {
  list.items = list.items.map((item) => {
    if (item.foodId && typeof item.foodId === "object") {
      const foodId = item.foodId as {
        image?: { url?: string }
        category?: string[]
        isFood?: boolean
        openFoodFactsData?: { imageUrl?: string }
      }
      const image =
        foodId.image ||
        (foodId.openFoodFactsData?.imageUrl
          ? { url: foodId.openFoodFactsData.imageUrl }
          : item.image)
      return {
        ...item,
        image,
        category: item.category || foodId.category,
        isFood:
          item.isFood !== undefined
            ? item.isFood
            : foodId.isFood !== undefined
              ? foodId.isFood
              : true,
      }
    }
    return item
  })
  return list
}

export const createShoppingList = async (
  req: AuthenticatedRequest<
    Record<string, string>,
    unknown,
    CreateShoppingListBody
  >,
  res: Response
) => {
  try {
    const { name, description, items, totalEstimatedPrice } = req.body

    if (!name || !Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: "Name and items are required",
      })
    }

    const ownership = getDataOwnership(req.user)
    const mappedItems = items.map((item) => {
      const { _id: _ignoredId, ...rest } = (item || {}) as ShoppingListItemInput & {
        _id?: unknown
      }
      return mapShoppingListItem(rest) as IShoppingListItem
    })
    await applyEstimatesToShoppingItems(req.user, mappedItems)
    await Promise.all(
      mappedItems.map(async (item) => {
        const userPrice = positivePrice(item.price)
        if (userPrice > 0 && item.foodId) {
          await rememberUserPriceOnFoodItem(item.foodId, userPrice, {
            quantity: item.quantity,
            unit: item.unit,
          })
        }
      })
    )
    const shoppingList = new ShoppingList({
      userId: ownership.userId,
      household: ownership.household,
      name,
      description,
      items: mappedItems,
      totalEstimatedPrice: shoppingListDisplayTotal(
        mappedItems,
        totalEstimatedPrice
      ),
    })

    await shoppingList.save()

    res.json({ success: true, shoppingList })
  } catch (error: unknown) {
    console.error("Error creating shopping list:", error)
    res.status(400).json({ success: false, error: getErrorMessage(error) })
  }
}

export const getShoppingLists = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const query = await getDataQuery(req.user)
    const shoppingLists = await ShoppingList.find(query)
      .populate({
        path: "items.foodId",
        select: FOOD_ITEM_SELECT,
      })
      .sort({ createdAt: -1 })

    const processedLists = shoppingLists.map((list) =>
      mergeFoodIdIntoItems(
        list.toObject() as unknown as { items: Array<Record<string, unknown>> }
      )
    )

    res.json({ success: true, shoppingLists: processedLists })
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const updateShoppingList = async (
  req: AuthenticatedRequest<
    { id: string },
    unknown,
    { items?: ShoppingListItemInput[]; totalEstimatedPrice?: number }
  >,
  res: Response
) => {
  try {
    const { id } = req.params
    const { items, totalEstimatedPrice } = req.body
    const query = await shoppingListAccessQuery(req.user, id)

    const existingList = await ShoppingList.findOne(query)
    if (!existingList) {
      return res.status(404).json({
        success: false,
        message: "Shopping list not found or unauthorized",
      })
    }

    if (items) {
      existingList.items = items.map(mapShoppingListItem) as IShoppingListItem[]
      await applyEstimatesToShoppingItems(req.user, existingList.items)
      // A duplicate collapse sends line totals already scaled to the merged
      // quantity. Keep those instead of a fresh single-package estimate.
      items.forEach((raw, index) => {
        const item = existingList.items[index]
        if (!item || positivePrice(item.price) > 0) return
        const estimate = positivePrice(raw.priceEstimate)
        if (!(estimate > 0)) return
        item.priceEstimate = estimate
        item.priceEstimateSource =
          raw.priceEstimateSource === "category" ? "category" : "history"
      })
    }
    existingList.totalEstimatedPrice = shoppingListDisplayTotal(
      existingList.items,
      totalEstimatedPrice !== undefined
        ? totalEstimatedPrice
        : existingList.totalEstimatedPrice
    )
    existingList.markModified("items")
    await existingList.save()

    const shoppingList = await ShoppingList.findOne(query).populate({
      path: "items.foodId",
      select: FOOD_ITEM_SELECT,
    })

    if (!shoppingList) {
      return res.status(404).json({
        success: false,
        message: "Shopping list not found or unauthorized",
      })
    }

    res.json({
      success: true,
      shoppingList: mergeFoodIdIntoItems(
        shoppingList.toObject() as unknown as {
          items: Array<Record<string, unknown>>
        }
      ),
    })
  } catch (error: unknown) {
    res.status(400).json({ success: false, error: getErrorMessage(error) })
  }
}

export const setItemBought = async (
  req: AuthenticatedRequest<
    { listId: string; itemId: string },
    unknown,
    { bought?: boolean }
  >,
  res: Response
) => {
  try {
    const { listId, itemId } = req.params
    const normalizedItemId = String(itemId)

    const shoppingList = await ShoppingList.findOne(
      await shoppingListAccessQuery(req.user, listId)
    )

    if (!shoppingList) {
      return res.status(404).json({
        success: false,
        message: "Shopping list not found",
      })
    }

    const item = shoppingList.items.find(
      (listItem) => listItem._id?.toString() === normalizedItemId
    )

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found in shopping list",
      })
    }

    if (typeof req.body?.bought !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "bought must be a boolean",
      })
    }

    item.bought = req.body.bought
    shoppingList.markModified("items")
    await shoppingList.save()

    const updatedShoppingList = await ShoppingList.findOne(
      await shoppingListAccessQuery(req.user, listId)
    ).populate({
      path: "items.foodId",
      select: FOOD_ITEM_SELECT,
    })

    res.json({
      success: true,
      message: item.bought ? "Item marked as bought" : "Item restored to list",
      shoppingList: updatedShoppingList
        ? mergeFoodIdIntoItems(
            updatedShoppingList.toObject() as unknown as {
              items: Array<Record<string, unknown>>
            }
          )
        : shoppingList,
    })
  } catch (error: unknown) {
    console.error("Error in setItemBought:", error)
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    })
  }
}

export const moveItemToPantry = async (
  req: AuthenticatedRequest<{ listId: string; itemId: string }>,
  res: Response
) => {
  try {
    const { listId, itemId } = req.params
    const result = await moveShoppingListItemsToPantryInternal(
      req.user,
      listId,
      [String(itemId)]
    )

    if (result.status === "not_found_list") {
      return res.status(404).json({
        success: false,
        message: "Shopping list not found",
      })
    }

    if (result.moved.length === 0 && result.notFound.length > 0) {
      return res.status(404).json({
        success: false,
        message: "Item not found in shopping list",
      })
    }

    if (result.moved.length === 0 && result.skippedNonFood.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Non-food items cannot be moved to pantry",
      })
    }

    res.json({
      success: true,
      message: "Item moved to pantry",
      shoppingList: result.shoppingList,
      moved: result.moved,
      skippedNonFood: result.skippedNonFood,
    })
  } catch (error: unknown) {
    console.error("Error in moveItemToPantry:", error)
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    })
  }
}

export const moveItemsToPantry = async (
  req: AuthenticatedRequest<
    { listId: string },
    unknown,
    { itemIds?: string[] }
  >,
  res: Response
) => {
  try {
    const { listId } = req.params
    const itemIds = Array.isArray(req.body?.itemIds)
      ? req.body.itemIds.map(String).filter(Boolean)
      : []

    if (itemIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "itemIds must be a non-empty array",
      })
    }

    const result = await moveShoppingListItemsToPantryInternal(
      req.user,
      listId,
      itemIds
    )

    if (result.status === "not_found_list") {
      return res.status(404).json({
        success: false,
        message: "Shopping list not found",
      })
    }

    res.json({
      success: true,
      message:
        result.moved.length > 0
          ? `${result.moved.length} item(s) moved to pantry`
          : "No items moved to pantry",
      shoppingList: result.shoppingList,
      moved: result.moved,
      skippedNonFood: result.skippedNonFood,
      removedNonFood: result.removedNonFood ?? result.skippedNonFood,
      notFound: result.notFound,
    })
  } catch (error: unknown) {
    console.error("Error in moveItemsToPantry:", error)
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    })
  }
}

type MoveToPantryUser = NonNullable<AuthenticatedRequest["user"]>

const transferShoppingItemToPantryDoc = async (
  user: MoveToPantryUser,
  pantry: Awaited<ReturnType<typeof getCanonicalPantry>>,
  item: IShoppingListItem
) => {
  const pantryQty = parseQuantity(item.quantity)
  const resolvedFoodId = resolveItemFoodId(item.foodId)
  const unit = normalizeAppUnit(item.unit)
  hydratePantryLocations(pantry)
  const inferredType = inferLocationTypeFromCategories(item.category)
  const inferredLocation = inferredType
    ? findFirstLocationOfType(pantry, inferredType)
    : undefined
  const locationKey = inferredLocation?._id
    ? String(inferredLocation._id)
    : "none"
  const rowCategories = inferredType
    ? syncStorageCategoryForLocation(item.category, inferredType)
    : item.category || []

  if (resolvedFoodId) {
    const foodItem = await FoodItem.findOne({
      _id: resolvedFoodId,
      user: user._id,
    })

    if (foodItem) {
      foodItem.unit = unit
      await foodItem.save()
    }
  }

  const existingPantryItem =
    (resolvedFoodId &&
      pantry.items.find(
        (pantryItem) =>
          pantryItem.foodId?.toString() === String(resolvedFoodId) &&
          normalizeAppUnit(pantryItem.unit) === unit &&
          itemLocationKey(pantryItem) === locationKey
      )) ||
    pantry.items.find(
      (pantryItem) =>
        pantryItemMergeKey(pantryItem.name) ===
          pantryItemMergeKey(item.name) &&
        normalizeAppUnit(pantryItem.unit) === unit &&
        itemLocationKey(pantryItem) === locationKey
    )

  if (existingPantryItem) {
    existingPantryItem.quantity =
      (Number(existingPantryItem.quantity) || 0) + pantryQty
    existingPantryItem.unit = unit
    existingPantryItem.category = rowCategories.length
      ? rowCategories
      : existingPantryItem.category || []
    existingPantryItem.calories =
      item.calories || existingPantryItem.calories || 0
    existingPantryItem.price =
      item.price || item.priceEstimate || item.estimatedPrice || existingPantryItem.price || 0
    if (resolvedFoodId) {
      existingPantryItem.foodId = resolvedFoodId
    }
    existingPantryItem.name = item.name
    if (inferredLocation?._id) {
      existingPantryItem.locationId =
        inferredLocation._id as typeof existingPantryItem.locationId
    }
  } else {
    pantry.items.push({
      foodId: resolvedFoodId,
      name: item.name,
      quantity: pantryQty,
      unit,
      category: rowCategories,
      calories: item.calories || 0,
      price: item.price || item.priceEstimate || item.estimatedPrice || 0,
      addedFrom: "shopping-list",
      expirationDateSetByUser: false,
      locationId: inferredLocation?._id || null,
    } as IPantryItem)
  }
}

const normalizeDocId = (value: unknown): string => {
  if (value == null) return ""
  if (typeof value === "object") {
    const asRecord = value as {
      _id?: unknown
      id?: unknown
      $oid?: unknown
      toHexString?: () => string
      toString?: () => string
    }
    if (asRecord.$oid != null) return String(asRecord.$oid)
    if (typeof asRecord.toHexString === "function") {
      return asRecord.toHexString()
    }
    if (asRecord._id != null) return normalizeDocId(asRecord._id)
    if (asRecord.id != null) return normalizeDocId(asRecord.id)
    if (typeof asRecord.toString === "function") {
      const asString = asRecord.toString()
      if (asString && asString !== "[object Object]") return asString
    }
    return ""
  }
  return String(value).trim()
}

const moveShoppingListItemsToPantryInternal = async (
  user: MoveToPantryUser,
  listId: string,
  itemIds: string[]
) => {
  const shoppingList = await ShoppingList.findOne(
    await shoppingListAccessQuery(user, listId)
  )

  if (!shoppingList) {
    return {
      status: "not_found_list" as const,
      shoppingList: null,
      moved: [] as Array<{ id: string; name: string }>,
      skippedNonFood: [] as Array<{ id: string; name: string }>,
      removedNonFood: [] as Array<{ id: string; name: string }>,
      notFound: itemIds,
    }
  }

  const uniqueIds = [
    ...new Set(itemIds.map((id) => normalizeDocId(id)).filter(Boolean)),
  ]
  const idSet = new Set(uniqueIds)
  const moved: Array<{ id: string; name: string }> = []
  const skippedNonFood: Array<{ id: string; name: string }> = []

  const pantry = await getCanonicalPantry(user)
  const itemsToMove: IShoppingListItem[] = []
  const nonFoodToRemove: IShoppingListItem[] = []

  for (const item of shoppingList.items) {
    const itemId = normalizeDocId(item._id)
    if (!idSet.has(itemId)) continue

    if (item.isFood === false) {
      skippedNonFood.push({ id: itemId, name: item.name })
      nonFoodToRemove.push(item)
      continue
    }

    itemsToMove.push(item)
  }

  const foundIds = new Set([
    ...itemsToMove.map((item) => normalizeDocId(item._id)),
    ...skippedNonFood.map((item) => item.id),
  ])
  const notFound = uniqueIds.filter((id) => !foundIds.has(id))

  console.log("[move-to-pantry]", {
    listId,
    requested: uniqueIds,
    moving: itemsToMove.map((item) => ({
      id: normalizeDocId(item._id),
      name: item.name,
    })),
    skippedNonFood,
    notFound,
  })

  for (const item of itemsToMove) {
    await transferShoppingItemToPantryDoc(user, pantry, item)
    moved.push({ id: normalizeDocId(item._id), name: item.name })
  }

  // Selected non-food items leave the list (not pantry) so a mixed
  // "Siirrä pentteriin" selection clears everything the user checked.
  const removeIdSet = new Set([
    ...moved.map((item) => item.id),
    ...skippedNonFood.map((item) => item.id),
  ])

  if (removeIdSet.size > 0) {
    for (let i = shoppingList.items.length - 1; i >= 0; i -= 1) {
      const itemId = normalizeDocId(shoppingList.items[i]?._id)
      if (removeIdSet.has(itemId)) {
        shoppingList.items.splice(i, 1)
      }
    }
    shoppingList.totalEstimatedPrice = shoppingListDisplayTotal(
      shoppingList.items
    )
    if (moved.length > 0) {
      mergeDuplicatePantryItems(pantry)
      pantry.markModified("items")
    }
    shoppingList.markModified("items")
    await Promise.all([
      shoppingList.save(),
      ...(moved.length > 0 ? [pantry.save()] : []),
    ])

    await ShoppingList.updateOne(await shoppingListAccessQuery(user, listId), {
      $pull: { items: { _id: { $in: [...removeIdSet] } } },
    })
  }

  const updatedShoppingList = await ShoppingList.findOne(
    await shoppingListAccessQuery(user, listId)
  ).populate({
    path: "items.foodId",
    select: FOOD_ITEM_SELECT,
  })

  if (updatedShoppingList && removeIdSet.size > 0) {
    const expectedTotal = shoppingListDisplayTotal(updatedShoppingList.items)
    if (updatedShoppingList.totalEstimatedPrice !== expectedTotal) {
      updatedShoppingList.totalEstimatedPrice = expectedTotal
      await updatedShoppingList.save()
    }
  }

  return {
    status: "ok" as const,
    shoppingList: updatedShoppingList
      ? mergeFoodIdIntoItems(
          updatedShoppingList.toObject() as unknown as {
            items: Array<Record<string, unknown>>
          }
        )
      : mergeFoodIdIntoItems(
          shoppingList.toObject() as unknown as {
            items: Array<Record<string, unknown>>
          }
        ),
    moved,
    skippedNonFood,
    removedNonFood: skippedNonFood,
    notFound,
  }
}

export const deleteShoppingListItem = async (
  req: AuthenticatedRequest<{ listId: string; itemId: string }>,
  res: Response
) => {
  try {
    const { listId, itemId } = req.params
    const normalizedItemId = String(itemId)

    const shoppingList = await ShoppingList.findOne(
      await shoppingListAccessQuery(req.user, listId)
    )

    if (!shoppingList) {
      return res.status(404).json({
        success: false,
        message: "Shopping list not found",
      })
    }

    const itemIndex = shoppingList.items.findIndex((listItem) => {
      const rowId = listItem._id?.toString?.() || String(listItem._id || "")
      if (rowId && rowId === normalizedItemId) return true
      const foodId =
        listItem.foodId &&
        typeof listItem.foodId === "object" &&
        "_id" in listItem.foodId
          ? String((listItem.foodId as { _id: unknown })._id)
          : listItem.foodId
            ? String(listItem.foodId)
            : ""
      return Boolean(foodId) && foodId === normalizedItemId
    })

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Item not found in shopping list",
      })
    }

    const item = shoppingList.items[itemIndex]

    shoppingList.items.splice(itemIndex, 1)
    shoppingList.totalEstimatedPrice = shoppingListDisplayTotal(
      shoppingList.items
    )
    shoppingList.markModified("items")
    await shoppingList.save()

    const updatedShoppingList = await ShoppingList.findOne(
      await shoppingListAccessQuery(req.user, listId)
    ).populate({
      path: "items.foodId",
      select: FOOD_ITEM_SELECT,
    })

    res.json({
      success: true,
      message: "Item removed from shopping list",
      shoppingList: updatedShoppingList
        ? mergeFoodIdIntoItems(
            updatedShoppingList.toObject() as unknown as {
              items: Array<Record<string, unknown>>
            }
          )
        : shoppingList,
    })
  } catch (error: unknown) {
    console.error("Error in deleteShoppingListItem:", error)
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    })
  }
}

export const updateShoppingListItem = async (
  req: AuthenticatedRequest<
    { listId: string; itemId: string },
    unknown,
    ShoppingListItemInput
  >,
  res: Response
) => {
  try {
    const { listId, itemId } = req.params
    const updates = req.body
    const normalizedItemId = String(itemId)

    const shoppingList = await ShoppingList.findOne(
      await shoppingListAccessQuery(req.user, listId)
    )

    if (!shoppingList) {
      return res.status(404).json({
        success: false,
        message: "Shopping list not found",
      })
    }

    const item = shoppingList.items.find(
      (listItem) => listItem._id?.toString() === normalizedItemId
    )

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found in shopping list",
      })
    }

    if (updates.name !== undefined) item.name = updates.name
    if (updates.quantity !== undefined) {
      item.quantity = parseQuantity(updates.quantity)
    }
    if (updates.unit !== undefined) item.unit = updates.unit
    if (updates.category !== undefined || updates.categories !== undefined) {
      item.category = updates.category || updates.categories || []
    }
    if (updates.calories !== undefined) item.calories = updates.calories
    if (updates.price !== undefined) item.price = positivePrice(updates.price)
    if (updates.estimatedPrice !== undefined) {
      item.estimatedPrice = updates.estimatedPrice
    }
    if (updates.isFood !== undefined) {
      item.isFood = resolveIsFood(updates.isFood, true)
      if (!item.isFood) {
        item.category = []
        item.calories = 0
      }
    }
    if (updates.bought !== undefined) {
      item.bought = Boolean(updates.bought)
    }
    const resolvedFoodId = resolveItemFoodId(updates.foodId)
    if (resolvedFoodId) {
      item.foodId = resolvedFoodId
    }

    const userPrice = positivePrice(item.price)
    const shouldEstimate =
      !userPrice &&
      (updates.price !== undefined ||
        updates.quantity !== undefined ||
        updates.unit !== undefined ||
        updates.name !== undefined ||
        updates.category !== undefined ||
        updates.categories !== undefined ||
        updates.isFood !== undefined ||
        !(positivePrice(item.priceEstimate) > 0))
    if (userPrice > 0) {
      item.priceEstimate = undefined
      item.priceEstimateSource = undefined
      if (updates.price !== undefined) {
        await rememberUserPriceOnFoodItem(item.foodId, userPrice, {
          quantity: item.quantity,
          unit: item.unit,
        })
      }
    } else if (shouldEstimate) {
      const clientEstimate = positivePrice(updates.priceEstimate)
      if (clientEstimate > 0) {
        // Duplicate-merge sends a line total already scaled to the new quantity.
        item.priceEstimate = clientEstimate
        item.priceEstimateSource =
          updates.priceEstimateSource === "category" ? "category" : "history"
      } else {
        // The stored estimate is for the previous quantity. Drop it so the
        // server can scale a fresh one.
        item.priceEstimate = undefined
        item.priceEstimateSource = undefined
      }
      await applyEstimatesToShoppingItems(req.user, [item])
    } else if (updates.priceEstimate !== undefined) {
      const estimate = positivePrice(updates.priceEstimate)
      item.priceEstimate = estimate > 0 ? estimate : undefined
      item.priceEstimateSource =
        estimate > 0
          ? updates.priceEstimateSource === "category"
            ? "category"
            : "history"
          : undefined
    }

    shoppingList.totalEstimatedPrice = shoppingListDisplayTotal(
      shoppingList.items
    )
    shoppingList.markModified("items")

    await shoppingList.save()

    const updatedShoppingList = await ShoppingList.findOne(
      await shoppingListAccessQuery(req.user, listId)
    ).populate({
      path: "items.foodId",
      select: FOOD_ITEM_SELECT,
    })

    res.json({
      success: true,
      shoppingList: updatedShoppingList
        ? mergeFoodIdIntoItems(
            updatedShoppingList.toObject() as unknown as {
              items: Array<Record<string, unknown>>
            }
          )
        : shoppingList,
    })
  } catch (error: unknown) {
    res.status(400).json({ success: false, error: getErrorMessage(error) })
  }
}

export const addItemsToShoppingList = async (
  req: AuthenticatedRequest<
    { id: string },
    unknown,
    { items?: ShoppingListItemInput[] }
  >,
  res: Response
) => {
  try {
    const { id } = req.params
    const { items } = req.body

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Items are required",
      })
    }

    const shoppingList = await ShoppingList.findOne(
      await shoppingListAccessQuery(req.user, id)
    )

    if (!shoppingList) {
      return res.status(404).json({
        success: false,
        message: "Shopping list not found or unauthorized",
      })
    }

    const mappedItems = items.map((item) => {
      // Ignore client-provided row ids on create — barcode flow may send a
      // FoodItem id as _id, which breaks later delete/update by row id.
      const { _id: _ignoredId, ...rest } = (item || {}) as ShoppingListItemInput & {
        _id?: unknown
      }
      return mapShoppingListItem(rest) as IShoppingListItem
    })
    // Seed scan-preview estimates before server recalculation so a failed
    // lookup does not leave the new row without a price.
    items.forEach((raw, index) => {
      const estimate = positivePrice(raw.priceEstimate)
      if (!(estimate > 0) || positivePrice(mappedItems[index]?.price) > 0) {
        return
      }
      mappedItems[index].priceEstimate = estimate
      mappedItems[index].priceEstimateSource =
        raw.priceEstimateSource === "category" ? "category" : "history"
    })
    await applyEstimatesToShoppingItems(req.user, mappedItems)
    // Restore scan-preview estimates when the server could not recalculate.
    items.forEach((raw, index) => {
      const item = mappedItems[index]
      if (!item || positivePrice(item.price) > 0) return
      if (positivePrice(item.priceEstimate) > 0) return
      const estimate = positivePrice(raw.priceEstimate)
      if (!(estimate > 0)) return
      item.priceEstimate = estimate
      item.priceEstimateSource =
        raw.priceEstimateSource === "category" ? "category" : "history"
    })
    await Promise.all(
      mappedItems.map(async (item) => {
        const userPrice = positivePrice(item.price)
        if (userPrice > 0 && item.foodId) {
          await rememberUserPriceOnFoodItem(item.foodId, userPrice, {
            quantity: item.quantity,
            unit: item.unit,
          })
        }
      })
    )
    shoppingList.items.push(...mappedItems)

    shoppingList.totalEstimatedPrice = shoppingListDisplayTotal(
      shoppingList.items
    )

    await shoppingList.save()

    const updatedShoppingList = await ShoppingList.findOne(
      await shoppingListAccessQuery(req.user, id)
    ).populate({
      path: "items.foodId",
      select: FOOD_ITEM_SELECT,
    })

    res.json({
      success: true,
      shoppingList: updatedShoppingList
        ? mergeFoodIdIntoItems(
            updatedShoppingList.toObject() as unknown as {
              items: Array<Record<string, unknown>>
            }
          )
        : shoppingList,
    })
  } catch (error: unknown) {
    console.error("Error in addItemsToShoppingList:", error)
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    })
  }
}

export const deleteShoppingList = async (
  req: AuthenticatedRequest<{ id: string }>,
  res: Response
) => {
  try {
    const { id } = req.params

    const shoppingList = await ShoppingList.findOneAndDelete(
      await shoppingListAccessQuery(req.user, id)
    )

    if (!shoppingList) {
      return res.status(404).json({
        success: false,
        message: "Shopping list not found or unauthorized",
      })
    }

    res.json({ success: true, message: "Shopping list deleted successfully" })
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

export const previewShoppingListPrices = async (
  req: AuthenticatedRequest<
    Record<string, string>,
    unknown,
    { items?: ShoppingListItemInput[] }
  >,
  res: Response
) => {
  try {
    const items = req.body?.items
    if (!Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: "Items are required",
      })
    }

    const estimated = await estimateShoppingListItems(req.user, items)
    res.json({
      success: true,
      items: estimated.map((item) => ({
        name: item.name,
        price: positivePrice(item.price),
        priceEstimate: item.priceEstimate,
        priceEstimateSource: item.priceEstimateSource,
        priceFromOpenPrices: item.priceFromOpenPrices || false,
      })),
    })
  } catch (error: unknown) {
    console.error("Error in previewShoppingListPrices:", error)
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}
