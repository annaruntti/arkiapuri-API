import mongoose, { type Model } from "mongoose"
import type { IPantry, IPantryItem } from "../models/pantry"
import type { IUser } from "../models/user"
import {
  getDataOwnership,
  getDataQuery,
} from "./householdHelpers"
import { resolveModule } from "./controllerUtils"
import { normalizeAppUnit } from "../utils/openFoodFactsMapper"

const Pantry = resolveModule<Model<IPantry>>(require("../models/pantry"))

export const normalizePantryItemName = (name: string): string =>
  String(name || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(/\s+/g, " ")

/** Merge key that treats "Kevyt maito" and "Kevytmaito" as the same product. */
export const pantryItemMergeKey = (name: string): string =>
  normalizePantryItemName(name)
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim()

const getFoodIdString = (item: IPantryItem): string | null => {
  const foodId = item.foodId as unknown
  if (!foodId) return null
  if (typeof foodId === "object" && foodId !== null && "_id" in foodId) {
    return String((foodId as { _id: unknown })._id)
  }
  return String(foodId)
}

/**
 * Collapse pantry rows that share the same product name (or same foodId).
 * Name match is primary so duplicate adds with different foodItem ids still merge.
 * Quantities are summed; the soonest expiration date is kept.
 * Returns true if the pantry document was modified.
 */
export const mergeDuplicatePantryItems = (pantry: IPantry): boolean => {
  if (!pantry.items?.length) return false

  const getItemName = (item: IPantryItem): string => {
    const food = item.foodId as unknown as { name?: string } | null
    return item.name || food?.name || ""
  }

  type Acc = {
    primary: IPantryItem
    quantity: number
    expirationDate?: Date
    unit: string
  }

  const groups = new Map<string, Acc>()
  const originalCount = pantry.items.length

  for (const item of pantry.items) {
    const nameKey = pantryItemMergeKey(getItemName(item))
    const foodId = getFoodIdString(item)
    const itemUnit = normalizeAppUnit(item.unit)
    // Include unit so e.g. "1 kpl" and "500 g" of the same product are not
    // summed into a nonsense amount like "501 kpl".
    const key = nameKey
      ? `name:${nameKey}:unit:${itemUnit}`
      : foodId
        ? `food:${foodId}:unit:${itemUnit}`
        : `id:${String(item._id)}`

    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, {
        primary: item,
        quantity: Number(item.quantity) || 0,
        expirationDate: item.expirationDate,
        unit: itemUnit,
      })
      continue
    }

    existing.quantity += Number(item.quantity) || 0
    existing.unit = itemUnit
    if (
      item.expirationDate &&
      (!existing.expirationDate ||
        new Date(item.expirationDate) < new Date(existing.expirationDate))
    ) {
      existing.expirationDate = item.expirationDate
    }
    // Prefer the row that already has a linked food item
    if (!getFoodIdString(existing.primary) && foodId) {
      existing.primary = item
    }
  }

  if (groups.size === originalCount) {
    // Still normalize units in place when nothing to merge
    let unitChanged = false
    for (const item of pantry.items) {
      const normalized = normalizeAppUnit(item.unit)
      if (item.unit !== normalized) {
        item.unit = normalized
        unitChanged = true
      }
    }
    return unitChanged
  }

  if (groups.size === 0 && originalCount > 0) {
    return false
  }

  const mergedItems = [...groups.values()].map((group) => {
    const raw = group.primary.toObject
      ? group.primary.toObject()
      : { ...group.primary }
    // Drop mongoose subdoc id so a fresh subdocument is created; keep foodId link
    delete (raw as { _id?: unknown })._id
    if (raw.foodId && typeof raw.foodId === "object" && raw.foodId !== null) {
      raw.foodId =
        (raw.foodId as { _id?: unknown })._id || raw.foodId
    }
    return {
      ...raw,
      name: getItemName(group.primary),
      quantity: group.quantity,
      unit: normalizeAppUnit(group.unit),
      expirationDate: group.expirationDate || raw.expirationDate,
    }
  })

  pantry.set("items", mergedItems)
  pantry.markModified("items")
  return true
}

/**
 * Merge already-serialized pantry items for API responses / UI.
 */
export const mergeProcessedPantryItems = <
  T extends {
    name?: string
    quantity?: number
    unit?: string
    expirationDate?: Date | string
    foodId?: unknown
    image?: unknown
  },
>(
  items: T[]
): T[] => {
  const groups = new Map<string, T>()

  for (const item of items) {
    const foodName =
      item.foodId &&
      typeof item.foodId === "object" &&
      item.foodId !== null &&
      "name" in item.foodId
        ? String((item.foodId as { name?: string }).name || "")
        : ""
    const nameKey = pantryItemMergeKey(item.name || foodName)
    const foodId =
      item.foodId &&
      typeof item.foodId === "object" &&
      item.foodId !== null &&
      "_id" in item.foodId
        ? String((item.foodId as { _id: unknown })._id)
        : item.foodId
          ? String(item.foodId)
          : ""
    const itemUnit = normalizeAppUnit(item.unit)
    const key = nameKey
      ? `name:${nameKey}:unit:${itemUnit}`
      : foodId
        ? `food:${foodId}:unit:${itemUnit}`
        : `row:${groups.size}`

    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, {
        ...item,
        name: item.name || foodName,
        unit: itemUnit,
      })
      continue
    }

    const nextName = item.name || foodName || existing.name
    const preferSpacedName =
      /\s/.test(String(nextName)) && !/\s/.test(String(existing.name || ""))

    groups.set(key, {
      ...existing,
      name: preferSpacedName ? nextName : existing.name,
      quantity:
        (Number(existing.quantity) || 0) + (Number(item.quantity) || 0),
      unit: itemUnit,
      expirationDate:
        item.expirationDate &&
        (!existing.expirationDate ||
          new Date(item.expirationDate) < new Date(existing.expirationDate))
          ? item.expirationDate
          : existing.expirationDate,
      image: existing.image || item.image,
      foodId: existing.foodId || item.foodId,
    })
  }

  return [...groups.values()]
}

const pantryHouseholdId = (
  pantry: IPantry
): mongoose.Types.ObjectId | null => {
  const household = pantry.household as unknown
  if (!household) return null
  if (typeof household === "object" && household !== null && "_id" in household) {
    return (household as { _id: mongoose.Types.ObjectId })._id
  }
  return household as mongoose.Types.ObjectId
}

const pickCanonicalPantry = (pantries: IPantry[]): IPantry => {
  const byItemCount = (best: IPantry, current: IPantry) =>
    current.items.length > best.items.length ? current : best

  const householdPantries = pantries.filter((pantry) => pantryHouseholdId(pantry))
  if (householdPantries.length > 0) {
    return householdPantries.reduce(byItemCount)
  }
  return pantries.reduce(byItemCount)
}

const attachHouseholdIfMissing = (
  pantry: IPantry,
  householdId: mongoose.Types.ObjectId | null
): boolean => {
  if (!householdId || pantryHouseholdId(pantry)) return false
  pantry.household = householdId
  return true
}

/**
 * Find (or create) the single canonical pantry for the user/household.
 * If multiple pantry documents exist, merge into one and delete duplicates.
 * A household pantry always wins so other members still find it via household.
 */
export const getCanonicalPantry = async (user: IUser): Promise<IPantry> => {
  const ownership = getDataOwnership(user)
  let allPantries = await Pantry.find(await getDataQuery(user))

  // Auth populates household; a mismatched query must not hide the
  // user's existing pantry and then create a new empty one.
  if (allPantries.length === 0) {
    allPantries = await Pantry.find({ userId: user._id })
  }

  if (allPantries.length === 0) {
    const pantry = new Pantry({ ...ownership, items: [] })
    await pantry.save()
    return pantry
  }

  if (allPantries.length === 1) {
    const pantry = allPantries[0]
    const itemsChanged = mergeDuplicatePantryItems(pantry)
    const householdAttached = attachHouseholdIfMissing(
      pantry,
      ownership.household
    )
    if (itemsChanged || householdAttached) {
      await pantry.save()
    }
    return pantry
  }

  const canonical = pickCanonicalPantry(allPantries)
  const others = allPantries.filter(
    (p) => p._id.toString() !== canonical._id.toString()
  )

  for (const other of others) {
    for (const item of other.items) {
      const nameKey = pantryItemMergeKey(item.name)
      const existing = canonical.items.find(
        (row) => pantryItemMergeKey(row.name) === nameKey
      )
      if (existing) {
        existing.quantity =
          (Number(existing.quantity) || 0) + (Number(item.quantity) || 0)
        continue
      }
      const raw = item.toObject ? item.toObject() : { ...item }
      delete (raw as { _id?: unknown })._id
      canonical.items.push(raw as IPantryItem)
    }
  }

  const householdFromDocs = allPantries
    .map((pantry) => pantryHouseholdId(pantry))
    .find((id) => id != null)
  attachHouseholdIfMissing(
    canonical,
    householdFromDocs || ownership.household
  )

  mergeDuplicatePantryItems(canonical)
  await canonical.save()
  await Pantry.deleteMany({ _id: { $in: others.map((p) => p._id) } })

  return canonical
}

/**
 * Catalog FoodItem.quantities.pantry / locations:pantry used to be a second
 * pantry table. Copy leftover catalog rows into the Pantry collection, then
 * clear those catalog flags so GET /food-items cannot be mistaken for pantry.
 */
export const migrateCatalogPantryIntoPantryDocs = async (): Promise<void> => {
  const db = mongoose.connection.db
  if (!db) return

  const foodItems = db.collection("fooditems")
  const pantries = db.collection("pantries")
  const users = db.collection("users")

  const catalogRows = foodItems.find({
    $or: [{ "quantities.pantry": { $gt: 0 } }, { locations: "pantry" }],
  })

  let moved = 0
  let cleared = 0

  for await (const food of catalogRows) {
    const qty = Number(food.quantities?.pantry) || 0
    const user = await users.findOne({ _id: food.user })
    const pantryQuery = user?.household
      ? { $or: [{ userId: food.user }, { household: user.household }] }
      : { userId: food.user }

    let pantryDocs = await pantries.find(pantryQuery).toArray()
    if (pantryDocs.length === 0) {
      pantryDocs = await pantries.find({ userId: food.user }).toArray()
    }

    let pantry = pantryDocs.sort(
      (a, b) => (b.items?.length || 0) - (a.items?.length || 0)
    )[0]

    if (!pantry) {
      const inserted = await pantries.insertOne({
        userId: food.user,
        household: user?.household || null,
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      pantry = await pantries.findOne({ _id: inserted.insertedId })
    }

    if (!pantry) continue

    const items = Array.isArray(pantry.items) ? pantry.items : []
    const foodIdStr = String(food._id)
    const nameKey = pantryItemMergeKey(String(food.name || ""))
    const exists = items.some((item) => {
      const itemFoodId = item.foodId ? String(item.foodId) : ""
      return (
        itemFoodId === foodIdStr ||
        (nameKey && pantryItemMergeKey(String(item.name || "")) === nameKey)
      )
    })

    if (!exists) {
      items.push({
        _id: new mongoose.Types.ObjectId(),
        foodId: food._id,
        name: food.name,
        quantity: qty > 0 ? qty : 1,
        unit: food.unit || "kpl",
        category: food.category || [],
        calories: food.calories || 0,
        price: food.price || 0,
        expirationDate:
          food.expirationDate ||
          food.expireDay ||
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        addedFrom: "pantry",
      })
      await pantries.updateOne(
        { _id: pantry._id },
        { $set: { items, updatedAt: new Date() } }
      )
      moved += 1
    }

    await foodItems.updateOne(
      { _id: food._id },
      {
        $set: { "quantities.pantry": 0 },
        $pull: { locations: "pantry" },
      } as unknown as mongoose.mongo.UpdateFilter<mongoose.mongo.BSON.Document>
    )
    cleared += 1
  }

  if (moved > 0 || cleared > 0) {
    console.log(
      `Merged ${moved} catalog pantry rows into pantries; cleared ${cleared} leftover catalog pantry flags`
    )
  }
}
