import type { Model } from "mongoose"
import type { IFoodItem } from "../models/foodItem"
import type { IPantryItem } from "../models/pantry"
import type { IShoppingList, IShoppingListItem } from "../models/shoppingList"
import {
  AuthenticatedRequest,
  parseQuantity,
  resolveModule,
} from "../helpers/controllerUtils"
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
import { shoppingListDisplayTotal } from "./priceEstimate"
import {
  FOOD_ITEM_SELECT,
  mergeFoodIdIntoItems,
  normalizeDocId,
  resolveItemFoodId,
  shoppingListAccessQuery,
} from "./shoppingListItemMapping"

const ShoppingList = resolveModule<Model<IShoppingList>>(
  require("../models/shoppingList")
)
const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))

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
      item.price ||
      item.priceEstimate ||
      item.estimatedPrice ||
      existingPantryItem.price ||
      0
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

export const moveShoppingListItemsToPantry = async (
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
