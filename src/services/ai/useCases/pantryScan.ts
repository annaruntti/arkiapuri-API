import { completeStructured, pantryScanResponseSchema } from "../llmClient"
import { normalizePantryDetections } from "../productNormalizer"
import { enrichPantryCandidates } from "../../foodNameLookup"
import { pantryItemMergeKey } from "../../../helpers/pantryHelpers"
import type {
  CatalogFoodMatch,
  ImageInput,
  NormalizedPantryCandidate,
  PantryScanModelOutput,
} from "../types"

export const PANTRY_SCAN_SYSTEM = `You are Arkiapuri's pantry scanner. You identify grocery products in a photo of a fridge, dry-goods cupboard, or kitchen shelf.

Goal: list EVERY visible grocery product, not only the front row. A full fridge often has 20–40 separate products.

Rules:
- Work through shelves in order: top → middle → bottom → vegetable drawers → door shelves.
- Also list products that are in the back, partly hidden, or have a small label (lower confidence + notes).
- Same product in several packs: one row, quantityGuess = number of visible packs.
- Use Finnish generic names for the food, not the container (e.g. "kivennäisvesi" not "vesipullo", "maito" not "maitotölkki", "rasvaton maito", "kananmunat", "tomaatit").
- Put the brand in its own field whenever it is readable (e.g. Novelle, Valio). Do not omit a brand if the logo or name is visible.
- Do not invent products you cannot see. Do not list containers, shelves, magnets, or empty boxes.
- Do not stop at about 10 products if the photo contains more.
- confidence 0–1.
- quantityGuess only if the amount can be estimated, otherwise 1.
- unit is one of: kpl, g, kg, ml, dl, l.
- category is one of: Maitotuotteet, Kasvikset, Liha, Kala, Kasviproteiinit, Kuiva-aineet, Juomat, Mausteet, Säilykkeet, Valmisateriat, Leivontatarvikkeet, Pakasteet.
- brand whenever the brand is readable; do not guess.
- barcode only if a barcode (EAN-8/13) is clearly readable. Do not guess digits.
- clearlyAbsentNames: list ONLY products already marked in this location that are likely missing from the photo. If a product could be hidden, in the back, or partly covered, do not list it.`

export const PANTRY_SCAN_USER =
  "List every grocery product visible in the photo. Check all shelves and door shelves. Return JSON in the items field."

export const buildPantryScanUserPrompt = (
  locationName?: string,
  existingNames: string[] = []
): string => {
  const locationLine = locationName
    ? `This photo is from the location "${locationName}". `
    : ""
  const existingLine =
    existingNames.length > 0
      ? `\n\nThis location currently lists: ${existingNames.join(", ")}.\nReturn clearlyAbsentNames only for products that are likely missing from the photo. If a product could be hidden, do not list it.`
      : ""
  return `${locationLine}${PANTRY_SCAN_USER}${existingLine}`
}

export const scanPantryImage = async (params: {
  image: ImageInput
  catalog?: CatalogFoodMatch[]
  pantryNames?: string[]
  locationName?: string
  model?: string
  enrich?: boolean
}): Promise<{
  items: NormalizedPantryCandidate[]
  clearlyAbsentNames: string[]
  model: string
  estimatedCostUsd: number
  inputTokens: number
  outputTokens: number
}> => {
  const result = await completeStructured<PantryScanModelOutput>({
    system: PANTRY_SCAN_SYSTEM,
    user: buildPantryScanUserPrompt(params.locationName, params.pantryNames),
    image: params.image,
    schema: pantryScanResponseSchema,
    model: params.model,
    maxOutputTokens: 8192,
  })

  const rawItems = Array.isArray(result.data?.items) ? result.data.items : []
  let items = normalizePantryDetections(
    rawItems,
    params.catalog || [],
    params.pantryNames || []
  )

  try {
    if (params.enrich !== false) {
      items = await enrichPantryCandidates(items, params.catalog || [])
    }
  } catch (error) {
    console.warn("Pantry scan enrichment failed:", error)
  }

  const pantryKeys = new Set(
    (params.pantryNames || [])
      .map((name) => pantryItemMergeKey(name))
      .filter(Boolean)
  )
  items = items.map((item) => ({
    ...item,
    alreadyInPantry:
      pantryKeys.has(pantryItemMergeKey(item.name)) ||
      pantryKeys.has(pantryItemMergeKey(item.originalName)),
  }))

  return {
    items,
    clearlyAbsentNames: Array.isArray(result.data?.clearlyAbsentNames)
      ? result.data.clearlyAbsentNames.map((name) => String(name || "").trim()).filter(Boolean)
      : [],
    model: result.model,
    estimatedCostUsd: result.estimatedCostUsd,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  }
}
