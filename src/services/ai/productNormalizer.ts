import {
  pantryItemMergeKey,
  normalizePantryItemName,
} from "../../helpers/pantryHelpers"
import { ALLOWED_PANTRY_UNITS, FOOD_CATEGORY_NAMES } from "./config"
import type {
  CatalogFoodMatch,
  NormalizedPantryCandidate,
  RawPantryDetection,
} from "./types"

const CATEGORY_KEYWORDS: Array<{ name: string; patterns: RegExp[] }> = [
  { name: "Maitotuotteet", patterns: [/maito/, /juusto/, /kerma/, /jogurtti/, /voi\b/, /piimä/, /rahka/] },
  { name: "Kala", patterns: [/kala/, /lohi/, /tonnikala/, /silakka/, /katkarapu/] },
  { name: "Liha", patterns: [/kana/, /liha/, /jauheliha/, /nakki/, /kinkku/, /pekoni/, /broileri/] },
  { name: "Kasviproteiinit", patterns: [/tofu/, /härkis/, /nyhtökaura/, /linssi/, /papu/, /soija/] },
  { name: "Kasvikset", patterns: [/tomaatti/, /kurkku/, /salaatti/, /porkkana/, /sipuli/, /pippuri/, /omena/, /banaani/, /marja/, /peruna/, /kaali/, /avokado/, /sitruuna/] },
  { name: "Kuiva-aineet", patterns: [/riisi/, /pasta/, /nuudeli/, /jauho/, /kaura/, /muro/, /leipä/, /hiutale/] },
  { name: "Juomat", patterns: [/mehu/, /vesi/, /limsa/, /kahvi/, /tee\b/, /olut/] },
  { name: "Mausteet", patterns: [/mauste/, /ketsuppi/, /sinappi/, /öljy/, /etikka/, /suola/, /pippuri/] },
  { name: "Säilykkeet", patterns: [/säilyke/, /purkki/] },
  { name: "Leivontatarvikkeet", patterns: [/sokeri/, /hiiva/, /leivinjauhe/, /vanilja/] },
  { name: "Pakasteet", patterns: [/pakaste/, /jäätelö/] },
  { name: "Valmisateriat", patterns: [/valmisateria/, /pizza/, /keitto/] },
]

const titleCaseFinnish = (name: string): string => {
  const trimmed = name.trim()
  if (!trimmed) return ""
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

export const resolvePantryUnit = (unit?: string): string => {
  const normalized = String(unit || "kpl").trim().toLowerCase()
  if (normalized === "pcs" || normalized === "piece" || normalized === "pieces") {
    return "kpl"
  }
  return (ALLOWED_PANTRY_UNITS as readonly string[]).includes(normalized)
    ? normalized
    : "kpl"
}

export const inferFoodCategories = (
  name: string,
  hinted?: string
): string[] => {
  const hint = FOOD_CATEGORY_NAMES.find(
    (category) => category.toLowerCase() === String(hinted || "").trim().toLowerCase()
  )
  if (hint) return [hint]

  const haystack = normalizePantryItemName(name)
  const matched = CATEGORY_KEYWORDS.filter((rule) =>
    rule.patterns.some((pattern) => pattern.test(haystack))
  ).map((rule) => rule.name)

  return [...new Set(matched)]
}

const clampConfidence = (value: unknown): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0.5
  return Math.min(1, Math.max(0, parsed))
}

const clampQuantity = (value: unknown): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 1
  return Math.round(parsed * 100) / 100
}

export const normalizePantryDetections = (
  detections: RawPantryDetection[],
  catalog: CatalogFoodMatch[] = [],
  pantryNames: string[] = []
): NormalizedPantryCandidate[] => {
  const catalogByKey = new Map<string, CatalogFoodMatch>()
  for (const item of catalog) {
    const key = pantryItemMergeKey(item.name)
    if (key && !catalogByKey.has(key)) catalogByKey.set(key, item)
  }

  const pantryKeys = new Set(
    pantryNames.map((name) => pantryItemMergeKey(name)).filter(Boolean)
  )

  const grouped = new Map<string, NormalizedPantryCandidate>()

  for (const detection of detections) {
    const originalName = String(detection?.name || "").trim()
    if (!originalName) continue

    const key = pantryItemMergeKey(originalName)
    if (!key) continue

    const catalogMatch = catalogByKey.get(key)
    const name = catalogMatch?.name || titleCaseFinnish(originalName)
    const confidence = clampConfidence(detection.confidence)
    const unit = resolvePantryUnit(detection.unit || catalogMatch?.unit)
    const quantity = clampQuantity(detection.quantityGuess)
    const category =
      catalogMatch?.category?.length
        ? catalogMatch.category
        : inferFoodCategories(name, detection.category)

    const candidate: NormalizedPantryCandidate = {
      name,
      originalName,
      confidence,
      quantity,
      unit,
      category,
      foodId: catalogMatch?._id || null,
      alreadyInPantry: pantryKeys.has(key) || Boolean(catalogMatch && pantryKeys.has(pantryItemMergeKey(catalogMatch.name))),
      notes: detection.notes?.trim() || undefined,
    }

    const existing = grouped.get(key)
    if (!existing || candidate.confidence > existing.confidence) {
      grouped.set(key, candidate)
    }
  }

  return [...grouped.values()].sort((a, b) => b.confidence - a.confidence)
}
