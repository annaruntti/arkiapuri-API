import type { Types } from "mongoose"
import type {
  IPantry,
  IPantryItem,
  IPantryRemovalSuggestion,
  PantryRemovalReason,
} from "../models/pantry"
import { pantryItemMergeKey } from "./pantryHelpers"
import { findPantryLocation, locationIdString, sameLocationId } from "./pantryLocations"

export const isUserSetExpired = (
  item: Pick<IPantryItem, "expirationDate" | "expirationDateSetByUser">,
  now = new Date()
): boolean => {
  if (!item.expirationDateSetByUser || !item.expirationDate) return false
  const expiration = new Date(item.expirationDate)
  if (Number.isNaN(expiration.getTime())) return false
  return expiration.getTime() < now.getTime()
}

const suggestionItemId = (suggestion: IPantryRemovalSuggestion): string =>
  String(suggestion.itemId)

const itemIdString = (item: IPantryItem): string => String(item._id)

export const pruneStaleRemovalSuggestions = (pantry: IPantry): boolean => {
  if (!Array.isArray(pantry.removalSuggestions) || !pantry.removalSuggestions.length) {
    return false
  }

  const itemsById = new Map(
    pantry.items.map((item) => [itemIdString(item), item])
  )
  const next = pantry.removalSuggestions.filter((suggestion) => {
    const item = itemsById.get(suggestionItemId(suggestion))
    if (!item) return false
    if (suggestion.reason === "missing_from_photo") {
      return sameLocationId(item.locationId, suggestion.locationId)
    }
    return true
  })

  if (next.length === pantry.removalSuggestions.length) return false
  pantry.set("removalSuggestions", next)
  pantry.markModified("removalSuggestions")
  return true
}

export const syncExpiredRemovalSuggestions = (
  pantry: IPantry,
  now = new Date()
): boolean => {
  if (!Array.isArray(pantry.removalSuggestions)) {
    pantry.set("removalSuggestions", [])
  }

  let changed = false
  const remaining: IPantryRemovalSuggestion[] = []

  for (const suggestion of pantry.removalSuggestions) {
    if (suggestion.reason !== "expired") {
      remaining.push(suggestion)
      continue
    }
    const item = pantry.items.find(
      (row) => itemIdString(row) === suggestionItemId(suggestion)
    )
    if (!item || !isUserSetExpired(item, now)) {
      changed = true
      continue
    }
    remaining.push(suggestion)
  }

  const expiredItemIds = new Set(
    remaining
      .filter((suggestion) => suggestion.reason === "expired")
      .map(suggestionItemId)
  )

  for (const item of pantry.items) {
    if (!isUserSetExpired(item, now) || !item._id) continue
    const id = itemIdString(item)
    if (expiredItemIds.has(id)) continue
    remaining.push({
      itemId: item._id as Types.ObjectId,
      reason: "expired",
      locationId: item.locationId || null,
      createdAt: now,
      dismissedAt: null,
    } as IPantryRemovalSuggestion)
    expiredItemIds.add(id)
    changed = true
  }

  if (!changed) return false
  pantry.set("removalSuggestions", remaining)
  pantry.markModified("removalSuggestions")
  return true
}

export const replacePhotoMissingSuggestions = (
  pantry: IPantry,
  locationId: unknown,
  missingItems: IPantryItem[],
  now = new Date()
): boolean => {
  if (!Array.isArray(pantry.removalSuggestions)) {
    pantry.set("removalSuggestions", [])
  }

  const targetLocation = locationIdString(locationId)
  const kept = pantry.removalSuggestions.filter(
    (suggestion) =>
      suggestion.reason !== "missing_from_photo" ||
      locationIdString(suggestion.locationId) !== targetLocation
  )

  const next = [
    ...kept,
    ...missingItems.map(
      (item) =>
        ({
          itemId: item._id as Types.ObjectId,
          reason: "missing_from_photo" as const,
          locationId: item.locationId || null,
          createdAt: now,
          dismissedAt: null,
        }) as IPantryRemovalSuggestion
    ),
  ]

  pantry.set("removalSuggestions", next)
  pantry.markModified("removalSuggestions")
  return true
}

export const dismissRemovalSuggestionsForItems = (
  pantry: IPantry,
  itemIds: string[],
  reason?: PantryRemovalReason,
  now = new Date()
): number => {
  if (!Array.isArray(pantry.removalSuggestions)) return 0
  const idSet = new Set(itemIds.map(String))
  let count = 0
  for (const suggestion of pantry.removalSuggestions) {
    if (suggestion.dismissedAt) continue
    if (!idSet.has(suggestionItemId(suggestion))) continue
    if (reason && suggestion.reason !== reason) continue
    suggestion.dismissedAt = now
    count += 1
  }
  if (count > 0) pantry.markModified("removalSuggestions")
  return count
}

export const clearExpiredSuggestionsForItem = (
  pantry: IPantry,
  itemId: unknown
): boolean => {
  if (!Array.isArray(pantry.removalSuggestions)) return false
  const id = String(itemId)
  const next = pantry.removalSuggestions.filter(
    (suggestion) =>
      !(
        suggestion.reason === "expired" &&
        suggestionItemId(suggestion) === id
      )
  )
  if (next.length === pantry.removalSuggestions.length) return false
  pantry.set("removalSuggestions", next)
  pantry.markModified("removalSuggestions")
  return true
}

export const serializeActiveRemovalSuggestions = (pantry: IPantry) => {
  if (!Array.isArray(pantry.removalSuggestions)) return []

  const itemsById = new Map(
    pantry.items.map((item) => [itemIdString(item), item])
  )

  return pantry.removalSuggestions
    .filter((suggestion) => !suggestion.dismissedAt)
    .flatMap((suggestion) => {
      const item = itemsById.get(suggestionItemId(suggestion))
      if (!item) return []
      const location = findPantryLocation(pantry, suggestion.locationId)
      return [
        {
          _id: suggestion._id,
          itemId: suggestionItemId(suggestion),
          itemName: item.name,
          quantity: item.quantity,
          unit: item.unit,
          reason: suggestion.reason,
          locationId: locationIdString(suggestion.locationId),
          locationName: location?.name || null,
          createdAt: suggestion.createdAt,
        },
      ]
    })
}

export const matchMissingLocationItems = <
  T extends { name?: string; _id?: unknown },
>(
  locationItems: T[],
  detections: Array<{
    name?: string
    originalName?: string
    matchName?: string
  }>,
  clearlyAbsentNames: string[] = []
): T[] => {
  const detectedKeys = new Set(
    detections
      .flatMap((detection) => [
        detection.name,
        detection.originalName,
        detection.matchName,
      ])
      .map((name) => pantryItemMergeKey(String(name || "")))
      .filter(Boolean)
  )
  const absentKeys = new Set(
    clearlyAbsentNames
      .map((name) => pantryItemMergeKey(String(name || "")))
      .filter(Boolean)
  )
  if (absentKeys.size === 0) return []

  return locationItems.filter((item) => {
    const key = pantryItemMergeKey(String(item.name || ""))
    if (!key || detectedKeys.has(key)) return false
    return absentKeys.has(key)
  })
}
