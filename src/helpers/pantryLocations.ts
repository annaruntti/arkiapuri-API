import type { IPantry, IPantryItem, IPantryLocation } from "../models/pantry"
import {
  PANTRY_LOCATION_TYPES,
  type PantryLocationType,
} from "../models/pantry"

export const DEFAULT_PANTRY_LOCATIONS: Array<{
  type: PantryLocationType
  name: string
}> = [
  { type: "fridge", name: "Jääkaappi" },
  { type: "freezer", name: "Pakastin" },
  { type: "cupboard", name: "Kuivakaappi" },
]

export const locationIdString = (value: unknown): string | null => {
  if (value == null || value === "") return null
  if (typeof value === "object") {
    const withHex = value as { toHexString?: () => string }
    if (typeof withHex.toHexString === "function") {
      return withHex.toHexString()
    }
    const record = value as { _id?: unknown; id?: unknown }
    if (record._id != null && record._id !== value) {
      return locationIdString(record._id)
    }
    if (typeof (value as { toString?: () => string }).toString === "function") {
      const asString = String(value)
      if (asString && asString !== "[object Object]") return asString
    }
    return null
  }
  const asString = String(value).trim()
  return asString || null
}

export const sameLocationId = (a: unknown, b: unknown): boolean =>
  (locationIdString(a) || "none") === (locationIdString(b) || "none")

export const isPantryLocationType = (
  value: unknown
): value is PantryLocationType =>
  typeof value === "string" &&
  (PANTRY_LOCATION_TYPES as readonly string[]).includes(value)

export const findPantryLocation = (
  pantry: IPantry,
  locationId: unknown
): IPantryLocation | undefined => {
  const id = locationIdString(locationId)
  if (!id || !Array.isArray(pantry.locations)) return undefined
  return pantry.locations.find((location) => String(location._id) === id)
}

export const ensureDefaultPantryLocations = (pantry: IPantry): boolean => {
  if (!Array.isArray(pantry.locations)) {
    pantry.set("locations", [])
  }
  if (pantry.locations.length > 0) return false
  for (const location of DEFAULT_PANTRY_LOCATIONS) {
    pantry.locations.push({
      type: location.type,
      name: location.name,
    } as IPantryLocation)
  }
  return true
}

export const itemLocationKey = (item: Pick<IPantryItem, "locationId">): string =>
  locationIdString(item.locationId) || "none"

export const nextPantryLocationName = (
  type: PantryLocationType,
  existingNames: string[]
): string => {
  const base =
    DEFAULT_PANTRY_LOCATIONS.find((location) => location.type === type)?.name ||
    "Säilytyspaikka"
  const taken = new Set(existingNames.map((name) => name.trim().toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  let n = 2
  while (taken.has(`${base} ${n}`.toLowerCase())) n += 1
  return `${base} ${n}`
}

/** Matches the "Säilytys" group in the app category picker. */
export const STORAGE_CATEGORY_BY_TYPE: Record<
  PantryLocationType,
  { id: string; name: string }
> = {
  fridge: { id: "24", name: "Jääkaappituotteet" },
  freezer: { id: "8", name: "Pakasteet" },
  cupboard: { id: "22", name: "Kuivatuotteet" },
}

const STORAGE_MATCHERS: Array<{
  type: PantryLocationType
  values: Set<string>
}> = (
  Object.entries(STORAGE_CATEGORY_BY_TYPE) as Array<
    [PantryLocationType, { id: string; name: string }]
  >
).map(([type, category]) => ({
  type,
  values: new Set([
    category.id,
    category.name.toLowerCase(),
    category.name.normalize("NFKC").toLowerCase(),
  ]),
}))

const categoryToken = (value: unknown): string => {
  if (value == null) return ""
  if (typeof value === "object" && value !== null && "name" in value) {
    return String((value as { name?: unknown }).name || "")
      .trim()
      .toLowerCase()
  }
  return String(value).trim().toLowerCase()
}

const isStorageCategoryToken = (token: string): boolean =>
  STORAGE_MATCHERS.some((matcher) => matcher.values.has(token))

export const inferLocationTypeFromCategories = (
  categories: unknown[] | undefined
): PantryLocationType | null => {
  const tokens = (categories || []).map(categoryToken).filter(Boolean)
  if (!tokens.length) return null
  // Frozen is the most specific storage type if several are tagged.
  for (const type of ["freezer", "fridge", "cupboard"] as const) {
    const matcher = STORAGE_MATCHERS.find((entry) => entry.type === type)
    if (matcher && tokens.some((token) => matcher.values.has(token))) {
      return type
    }
  }
  return null
}

export const findFirstLocationOfType = (
  pantry: IPantry,
  type: PantryLocationType
): IPantryLocation | undefined =>
  Array.isArray(pantry.locations)
    ? pantry.locations.find((location) => location.type === type)
    : undefined

export const itemCategoryList = (item: IPantryItem): unknown[] => {
  const own = Array.isArray(item.category) ? item.category : []
  const food =
    item.foodId &&
    typeof item.foodId === "object" &&
    item.foodId !== null &&
    "category" in item.foodId &&
    Array.isArray((item.foodId as { category?: unknown[] }).category)
      ? ((item.foodId as { category?: unknown[] }).category as unknown[])
      : []
  return [...own, ...food]
}

export const syncStorageCategoryForLocation = (
  categories: unknown[] | undefined,
  type: PantryLocationType | null
): string[] => {
  const kept = (categories || [])
    .map((value) => {
      if (value == null) return ""
      if (typeof value === "object" && value !== null && "name" in value) {
        return String((value as { name?: unknown }).name || "").trim()
      }
      return String(value).trim()
    })
    .filter((value) => value && !isStorageCategoryToken(value.toLowerCase()))

  if (!type) return kept
  const storageName = STORAGE_CATEGORY_BY_TYPE[type].name
  if (!kept.some((value) => value.toLowerCase() === storageName.toLowerCase())) {
    kept.push(storageName)
  }
  return kept
}

export const assignLocationsFromStorageCategories = (
  pantry: IPantry
): boolean => {
  if (!pantry.items?.length || !pantry.locations?.length) return false
  let changed = false
  for (const item of pantry.items) {
    if (locationIdString(item.locationId)) continue
    const type = inferLocationTypeFromCategories(itemCategoryList(item))
    if (!type) continue
    const location = findFirstLocationOfType(pantry, type)
    if (!location?._id) continue
    item.locationId = location._id as IPantryItem["locationId"]
    changed = true
  }
  return changed
}

export const hydratePantryLocations = (pantry: IPantry): boolean => {
  const seeded = ensureDefaultPantryLocations(pantry)
  const assigned = assignLocationsFromStorageCategories(pantry)
  return seeded || assigned
}
