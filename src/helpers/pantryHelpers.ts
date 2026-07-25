import type { Model } from "mongoose"
import type { IPantry } from "../models/pantry"
import type { IUser } from "../models/user"
import { getDataOwnership, getDataQuery } from "./householdHelpers"
import { resolveModule } from "./controllerUtils"

const Pantry = resolveModule<Model<IPantry>>(require("../models/pantry"))

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
    return allPantries[0]
  }

  const householdPantry = allPantries.find((p) => p.household)
  const canonical =
    householdPantry ||
    allPantries.reduce((a, b) => (a.items.length >= b.items.length ? a : b))
  const others = allPantries.filter(
    (p) => p._id.toString() !== canonical._id.toString()
  )

  const canonicalNames = new Set(
    canonical.items.map((i) => i.name.toLowerCase())
  )
  const itemsToMerge = []

  for (const other of others) {
    for (const item of other.items) {
      if (!canonicalNames.has(item.name.toLowerCase())) {
        const raw = item.toObject ? item.toObject() : { ...item }
        delete (raw as { _id?: unknown })._id
        itemsToMerge.push(raw)
        canonicalNames.add(item.name.toLowerCase())
      }
    }
  }

  if (itemsToMerge.length > 0) {
    canonical.items.push(...itemsToMerge)
  }
  await canonical.save()
  await Pantry.deleteMany({ _id: { $in: others.map((p) => p._id) } })

  return canonical
}
