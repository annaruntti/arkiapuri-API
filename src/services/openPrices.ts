import type { IFoodItem } from "../models/foodItem"
import {
  assignOpenPricesToFoodItem,
  priceFromOpenPricesObservations,
  type OpenPriceObservation,
} from "./priceEstimate"

const PRICES_URL = "https://prices.openfoodfacts.org/api/v1/prices"
const LOOKBACK_MS = 183 * 24 * 60 * 60 * 1000

interface OpenPricesPage {
  items?: Array<{
    price?: number
    currency?: string
    price_is_discounted?: boolean | null
    discount_type?: string | null
  }>
}

export const fetchOpenPricesMedian = async (
  barcode: string
): Promise<number | null> => {
  const code = String(barcode || "").replace(/[\s-]/g, "")
  if (!code) return null
  const since = new Date(Date.now() - LOOKBACK_MS).toISOString().slice(0, 10)
  const url = new URL(PRICES_URL)
  url.searchParams.set("product_code", code)
  url.searchParams.set("currency", "EUR")
  url.searchParams.set("date__gte", since)
  url.searchParams.set("size", "100")

  const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
  if (!response.ok) {
    throw new Error(`Open Prices request failed (${response.status})`)
  }
  const page = (await response.json()) as OpenPricesPage
  const observations: OpenPriceObservation[] = (page.items || [])
    .filter((row) => !row.currency || row.currency === "EUR")
    .map((row) => ({
      price: Number(row.price) || 0,
      priceIsDiscounted: row.price_is_discounted,
      discountType: row.discount_type,
    }))
  return priceFromOpenPricesObservations(observations)
}

/** Fetches a package price once and stores it when the food item has no price. A failed lookup leaves the price empty. */
export const fillFoodItemPriceFromOpenPrices = async (
  foodItem: IFoodItem
): Promise<void> => {
  if ((foodItem.price || 0) > 0) return
  const barcode = foodItem.openFoodFactsData?.barcode
  if (!barcode) return
  try {
    const median = await fetchOpenPricesMedian(barcode)
    assignOpenPricesToFoodItem(foodItem, median)
  } catch (error) {
    console.error("Open Prices lookup failed:", error)
  }
}
