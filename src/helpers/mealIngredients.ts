import mongoose from "mongoose"
import type { IFoodItem } from "../models/foodItem"
import type { IMealIngredient } from "../models/meal"

export const MEAL_FOOD_CATALOG_SELECT =
  "name unit category calories price image nutrition openFoodFactsData isFood quantities"

export interface MealIngredientInput {
  foodId?: string
  _id?: string
  quantity?: number | string
  unit?: string
}

export const resolveIngredientQuantity = (
  rowQuantity: unknown,
  catalogMealQuantity?: unknown
): number => {
  const fromRow = parseFloat(String(rowQuantity ?? ""))
  if (Number.isFinite(fromRow) && fromRow > 0) return fromRow
  const fromCatalog = parseFloat(String(catalogMealQuantity ?? ""))
  if (Number.isFinite(fromCatalog) && fromCatalog > 0) return fromCatalog
  return 1
}

export const parseIngredientQuantity = (value: unknown): number =>
  resolveIngredientQuantity(value)

export const resolveCatalogId = (item) => {
  if (!item || typeof item !== "object") return ""
  const raw = (item as { foodId?: unknown; _id?: unknown }).foodId
  if (raw && typeof raw === "object" && raw !== null && "_id" in raw) {
    return String((raw as { _id?: unknown })._id || "")
  }
  if (raw) return String(raw)
  const fallback = (item as { _id?: unknown })._id
  return fallback ? String(fallback) : ""
}

export const normalizeMealIngredientInputs = (
  foodItems: unknown
): Array<{ foodId: string; quantity: number; unit: string }> => {
  if (!Array.isArray(foodItems)) return []

  return foodItems
    .map((entry) => {
      if (typeof entry === "string") {
        return { foodId: entry, quantity: 1, unit: "kpl" }
      }
      if (!entry || typeof entry !== "object") return null
      const item = entry as MealIngredientInput
      const foodId = resolveCatalogId(item)
      if (!foodId || !mongoose.Types.ObjectId.isValid(foodId)) return null
      return {
        foodId,
        quantity: parseIngredientQuantity(item.quantity),
        unit: item.unit || "kpl",
      }
    })
    .filter((row): row is { foodId: string; quantity: number; unit: string } =>
      Boolean(row)
    )
}

type PopulatedIngredient = {
  foodId?: (IFoodItem & { _id: mongoose.Types.ObjectId }) | mongoose.Types.ObjectId | null
  quantity?: number
  unit?: string
}

export const flattenMealFoodItems = <T extends { foodItems?: unknown }>(
  meal: T | null | undefined
): T | null => {
  if (!meal) return null
  const source = meal as T & {
    toObject?: (options?: { getters?: boolean }) => T
  }
  const obj = (
    typeof source.toObject === "function"
      ? source.toObject({ getters: true })
      : { ...source }
  ) as T
  const rows = (
    Array.isArray(obj.foodItems) ? obj.foodItems : []
  ) as PopulatedIngredient[]

  const parseDefaultRoles = (value: unknown): string[] => {
    const roles: string[] = []
    const visit = (entry: unknown) => {
      if (entry == null || entry === "") return
      if (Array.isArray(entry)) {
        entry.forEach(visit)
        return
      }
      if (typeof entry !== "string") return
      const trimmed = entry.trim()
      if (
        (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
        (trimmed.startsWith('"') && trimmed.endsWith('"'))
      ) {
        try {
          visit(JSON.parse(trimmed))
          return
        } catch {
          // Treat as a plain role string
        }
      }
      roles.push(trimmed)
    }
    visit(value)
    return roles.length > 0 ? roles : ["dinner"]
  }

  return {
    ...obj,
    defaultRoles: parseDefaultRoles(
      (obj as T & { defaultRoles?: unknown }).defaultRoles
    ),
    foodItems: rows.map((row) => {
      const catalog =
        row.foodId && typeof row.foodId === "object" && "name" in row.foodId
          ? (row.foodId as IFoodItem & { _id: mongoose.Types.ObjectId })
          : null
      const foodId = catalog?._id || row.foodId
      const catalogFields = catalog
        ? {
            name: catalog.name,
            category: catalog.category,
            calories: catalog.calories,
            price: catalog.price,
            image: catalog.image,
            nutrition: catalog.nutrition,
            openFoodFactsData: catalog.openFoodFactsData,
            isFood: catalog.isFood,
          }
        : {}

      const catalogMealQty =
        catalog &&
        typeof catalog === "object" &&
        "quantities" in catalog
          ? (catalog as IFoodItem).quantities?.meal
          : undefined

      return {
        ...catalogFields,
        _id: foodId,
        foodId,
        quantity: resolveIngredientQuantity(row.quantity, catalogMealQty),
        unit: row.unit || catalog?.unit || "kpl",
      }
    }),
  }
}

export const migrateMealIngredientRows = async (): Promise<void> => {
  const db = mongoose.connection.db
  if (!db) return

  const meals = db.collection("meals")
  const foodItems = db.collection("fooditems")

  const legacyMeals = meals.find({
    $or: [
      { foodItems: { $elemMatch: { $type: "objectId" } } },
      { foodItems: { $elemMatch: { quantity: { $lte: 0 } } } },
      { foodItems: { $elemMatch: { quantity: { $exists: false } } } },
      { foodItems: { $elemMatch: { foodId: { $exists: false } } } },
    ],
  })

  let migrated = 0
  for await (const meal of legacyMeals) {
    const rows: IMealIngredient[] = []
    for (const entry of meal.foodItems || []) {
      const isObjectId =
        entry instanceof mongoose.Types.ObjectId ||
        (typeof entry !== "object" && mongoose.Types.ObjectId.isValid(String(entry)))

      if (isObjectId) {
        const id = new mongoose.Types.ObjectId(String(entry))
        const catalog = (await foodItems.findOne({ _id: id })) as {
          quantities?: { meal?: number }
          unit?: string
        } | null
        rows.push({
          foodId: id,
          quantity: resolveIngredientQuantity(undefined, catalog?.quantities?.meal),
          unit: catalog?.unit || "kpl",
        })
        continue
      }

      if (!entry || typeof entry !== "object") continue

      const doc = entry as {
        foodId?: mongoose.Types.ObjectId
        _id?: mongoose.Types.ObjectId
        quantity?: number
        unit?: string
      }
      const foodId = doc.foodId || doc._id
      if (!foodId) continue

      const catalog = (await foodItems.findOne({ _id: foodId })) as {
        quantities?: { meal?: number }
        unit?: string
      } | null

      rows.push({
        foodId,
        quantity: resolveIngredientQuantity(
          doc.quantity,
          catalog?.quantities?.meal
        ),
        unit: doc.unit || catalog?.unit || "kpl",
      })
    }
    await meals.updateOne({ _id: meal._id }, { $set: { foodItems: rows } })
    migrated += 1
  }

  if (migrated > 0) {
    console.log(`Migrated ${migrated} meals to per-ingredient quantities`)
  }
}
