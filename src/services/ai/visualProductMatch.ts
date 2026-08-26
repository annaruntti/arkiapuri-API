/**
 * Appearance match against previously saved FoodItem images.
 *
 * Enable only after pantry-scan eval shows back-of-pack / same-sku
 * recall staying near zero even with `--enrich` (catalog + OFF names).
 * Until then Gemini + catalog fuzzy match + review is the product loop.
 *
 * A real implementation would embed the scan crop and each household
 * catalog image (CLIP or Gemini embeddings) and return the nearest
 * foodId above a similarity threshold for the user to confirm.
 */
export type VisualProductCandidate = {
  foodId: string
  name: string
  score: number
}

export const VISUAL_MATCH_EVAL_TRIGGER = {
  tag: "back-of-pack",
  enrichRecallBelow: 0.2,
}

export const findCatalogMatchByAppearance = async (_params: {
  imageBase64: string
  catalog: Array<{ _id: string; name: string; imageUrl?: string }>
}): Promise<VisualProductCandidate | null> => {
  return null
}
