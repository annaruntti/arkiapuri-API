import type { Model } from "mongoose"
import type { IPantry, IPantryItem } from "../models/pantry"
import type { IUser } from "../models/user"
import { getDataOwnership, getDataQuery } from "./householdHelpers"
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

/**
 * Find (or create) the single canonical pantry for the user/household.
 * If multiple pantry documents exist, merge into one and delete duplicates.
 */
export const getCanonicalPantry = async (user: IUser): Promise<IPantry> => {
  const query = getDataQuery(user)
  const allPantries = await Pantry.find(query)

  if (allPantries.length === 0) {
    const ownership = getDataOwnership(user)
    const pantry = new Pantry({ ...ownership, items: [] })
    await pantry.save()
    return pantry
  }

  if (allPantries.length === 1) {
    const pantry = allPantries[0]
    if (mergeDuplicatePantryItems(pantry)) {
      await pantry.save()
    }
    return pantry
  }

  const householdPantry = allPantries.find((p) => p.household)
  const canonical =
    householdPantry ||
    allPantries.reduce((a, b) => (a.items.length >= b.items.length ? a : b))
  const others = allPantries.filter(
    (p) => p._id.toString() !== canonical._id.toString()
  )

  const canonicalNames = new Set(
    canonical.items.map((i) => pantryItemMergeKey(i.name))
  )
  const itemsToMerge = []

  for (const other of others) {
    for (const item of other.items) {
      const nameKey = pantryItemMergeKey(item.name)
      if (!canonicalNames.has(nameKey)) {
        const raw = item.toObject ? item.toObject() : { ...item }
        delete (raw as { _id?: unknown })._id
        itemsToMerge.push(raw)
        canonicalNames.add(nameKey)
      } else {
        const existing = canonical.items.find(
          (i) => pantryItemMergeKey(i.name) === nameKey
        )
        if (existing) {
          existing.quantity =
            (Number(existing.quantity) || 0) + (Number(item.quantity) || 0)
        }
      }
    }
  }

  if (itemsToMerge.length > 0) {
    canonical.items.push(...itemsToMerge)
  }
  mergeDuplicatePantryItems(canonical)
  await canonical.save()
  await Pantry.deleteMany({ _id: { $in: others.map((p) => p._id) } })

  return canonical
}
