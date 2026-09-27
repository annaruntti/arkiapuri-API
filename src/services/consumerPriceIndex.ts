import {
  categoryBaselineMonth,
  foodIndexMultiplierFromTable,
} from "./priceEstimate"

const CPI_URL =
  "https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/khi/15b5.px"
const CACHE_MS = 30 * 24 * 60 * 60 * 1000

let cached: { multiplier: number; fetchedAt: number } | null = null

const buildQuery = () => ({
  query: [
    {
      code: "timeperiod_m",
      selection: { filter: "top", values: ["24"] },
    },
    {
      code: "coicop_46_20231201",
      selection: { filter: "item", values: ["011"] },
    },
    {
      code: "contentscode",
      selection: { filter: "item", values: ["ip_khi"] },
    },
  ],
  response: { format: "json" },
})

/** Food CPI relative to the category baseline month. Falls back to 1 when the index cannot be read. */
export const getFoodPriceIndexMultiplier = async (): Promise<number> => {
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) {
    return cached.multiplier
  }
  try {
    const response = await fetch(CPI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildQuery()),
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error(`CPI request failed (${response.status})`)
    const table = (await response.json()) as {
      data?: Array<{ key?: string[]; values?: string[] }>
    }
    const multiplier = foodIndexMultiplierFromTable(table, categoryBaselineMonth)
    const resolved =
      multiplier != null && Number.isFinite(multiplier) && multiplier > 0
        ? multiplier
        : 1
    cached = { multiplier: resolved, fetchedAt: Date.now() }
    return resolved
  } catch (error) {
    console.error("Food price index lookup failed:", error)
    return cached?.multiplier ?? 1
  }
}
