import { Response } from "express"
import type { Model, Types } from "mongoose"
import type { IFoodItem } from "../models/foodItem"
import type { IPantryItem } from "../models/pantry"
import {
  AuthenticatedRequest,
  getErrorMessage,
  resolveModule,
} from "../helpers/controllerUtils"
import {
  getCanonicalPantry,
  mergeDuplicatePantryItems,
  mergeProcessedPantryItems,
} from "../helpers/pantryHelpers"

const FoodItem = resolveModule<Model<IFoodItem>>(require("../models/foodItem"))

interface AddFoodItemToPantryBody {
  name?: string
  category?: string[]
  quantity?: number | string
  unit?: string
  price?: number
  calories?: number
  expirationDate?: string | Date
  quantities?: IFoodItem["quantities"]
  foodId?: string
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
  [key: string]: unknown
}

const parseQuantity = (value: number | string | undefined): number => {
  if (value === undefined) return 1
  const parsed = typeof value === "number" ? value : parseFloat(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1
}

exports.getPantry = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pantry = await getCanonicalPantry(req.user)
    await pantry.populate({ path: "items.foodId" })

    // Normalize units only; do not overwrite names from food items
    // (that can split same-looking pantry rows into different merge keys).
    let touched = false
    for (const item of pantry.items) {
      if (item.unit === "pcs") {
        item.unit = "kpl"
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

    if (mergeDuplicatePantryItems(pantry) || touched) {
      await pantry.save()
      await pantry.populate({ path: "items.foodId" })
    }

    const processedItems = mergeProcessedPantryItems(
      pantry.items.map((item) => {
        const foodItemData =
          item.foodId && typeof item.foodId === "object"
            ? (item.foodId as unknown as Partial<IFoodItem>)
            : {}
        const unit = foodItemData.unit || item.unit || "kpl"
        return {
          ...item.toObject(),
          name: (item.name || foodItemData.name || "Nimetön tuote").trim(),
          category: foodItemData.category || item.category || [],
          unit: unit === "pcs" ? "kpl" : unit,
          calories: foodItemData.calories || item.calories || 0,
          price: foodItemData.price || item.price || 0,
          image:
            foodItemData.image ||
            (foodItemData.openFoodFactsData?.imageUrl
              ? { url: foodItemData.openFoodFactsData.imageUrl }
              : null),
        }
      })
    )

    res.json({
      success: true,
      pantry: {
        ...pantry.toObject(),
        items: processedItems,
      },
    })
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(error) })
  }
}

exports.addFoodItemToPantry = async (
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
      expirationDate,
      quantities,
      foodId,
    } = req.body

    if (!name?.trim() && !foodId) {
      return res.status(400).json({
        success: false,
        message: "Valid item name is required",
      })
    }

    const pantryQty = parseQuantity(quantity)
    const normalizedName = name?.trim() || ""

    let foodItem = foodId
      ? await FoodItem.findOne({ _id: foodId, user: req.user._id })
      : null

    if (!foodItem && normalizedName) {
      foodItem = await FoodItem.findOne({
        user: req.user._id,
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
        user: req.user._id,
        locations: ["pantry"],
        quantities: quantities || {
          meal: 0,
          "shopping-list": 0,
          pantry: pantryQty,
        },
      })
      await foodItem.save()
    } else {
      if (category) foodItem.category = category
      if (unit) foodItem.unit = unit
      if (price !== undefined) foodItem.price = price
      if (calories !== undefined) foodItem.calories = calories
      if (!foodItem.locations.includes("pantry")) {
        foodItem.locations.push("pantry")
      }
      if (quantities) {
        foodItem.quantities = {
          ...foodItem.quantities,
          ...quantities,
          pantry:
            quantities.pantry !== undefined
              ? quantities.pantry
              : (foodItem.quantities.pantry || 0) + pantryQty,
        }
      } else {
        foodItem.quantities.pantry =
          (foodItem.quantities.pantry || 0) + pantryQty
      }
      await foodItem.save()
    }

    const pantry = await getCanonicalPantry(req.user)

    const existingItem =
      pantry.items.find(
        (item) => item.foodId?.toString() === foodItem!._id.toString()
      ) ||
      pantry.items.find(
        (item) =>
          item.name.trim().toLowerCase() === foodItem!.name.trim().toLowerCase()
      )

    if (existingItem) {
      existingItem.quantity += pantryQty
      existingItem.unit = foodItem.unit
      existingItem.category = foodItem.category
      existingItem.calories = foodItem.calories || 0
      existingItem.price = foodItem.price || 0
      existingItem.foodId = foodItem._id
      existingItem.name = foodItem.name
      if (expirationDate) {
        existingItem.expirationDate = new Date(expirationDate)
      }
    } else {
      pantry.items.push({
        foodId: foodItem._id,
        name: foodItem.name,
        quantity: pantryQty,
        unit: foodItem.unit,
        category: foodItem.category,
        calories: foodItem.calories || 0,
        price: foodItem.price || 0,
        expirationDate:
          expirationDate
            ? new Date(expirationDate)
            : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
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

exports.updatePantryItem = async (
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

    Object.assign(item, update)
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

exports.removePantryItem = async (
  req: AuthenticatedRequest<{ itemId: string }>,
  res: Response
) => {
  try {
    const { itemId } = req.params
    const pantry = await getCanonicalPantry(req.user)

    ;(pantry.items as Types.DocumentArray<IPantryItem>).pull(itemId)
    await pantry.save()

    res.json({ success: true, message: "Item removed from pantry" })
  } catch (error: unknown) {
    res.status(400).json({ success: false, error: getErrorMessage(error) })
  }
}

/** Stub kept for route compatibility; frontend uses markItemAsBought instead. */
exports.moveToPantry = async (_req: AuthenticatedRequest, res: Response) => {
  res.status(200).json({
    success: true,
    message: "Items moved to pantry successfully",
  })
}
