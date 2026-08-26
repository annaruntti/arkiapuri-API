import {
  normalizePantryItemName,
  pantryItemMergeKey,
} from "../helpers/pantryHelpers"

const INFLECTION_SUFFIXES = new Set([
  "a",
  "ä",
  "n",
  "t",
  "ja",
  "jä",
  "aa",
  "ää",
  "ta",
  "tä",
  "ia",
  "iä",
  "ssa",
  "ssä",
  "sta",
  "stä",
  "lla",
  "llä",
  "lta",
  "ltä",
  "na",
  "nä",
  "ksi",
  "in",
  "en",
  "an",
  "än",
])

const NOISE_TOKENS = new Set([
  "kpl",
  "g",
  "kg",
  "mg",
  "ml",
  "l",
  "dl",
  "cl",
  "x",
  "%",
])

export const tokenizeFoodName = (name: string): string[] =>
  normalizePantryItemName(name)
    .split(/[\s,;/+()[\]{}.\-_|'"%]+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length > 0 &&
        !NOISE_TOKENS.has(token) &&
        !/^\d+[.,]?\d*$/.test(token)
    )

const editDistance = (a: string, b: string): number => {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > 2) return 9
  const rows = a.length + 1
  const cols = b.length + 1
  const prev = new Array(cols)
  const curr = new Array(cols)
  for (let j = 0; j < cols; j += 1) prev[j] = j
  for (let i = 1; i < rows; i += 1) {
    curr[0] = i
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j < cols; j += 1) prev[j] = curr[j]
  }
  return prev[b.length]
}

const tokensMatch = (queryToken: string, catalogToken: string): boolean => {
  if (queryToken === catalogToken) return true

  if (
    queryToken.startsWith(catalogToken) &&
    INFLECTION_SUFFIXES.has(queryToken.slice(catalogToken.length))
  ) {
    return true
  }
  if (
    catalogToken.startsWith(queryToken) &&
    INFLECTION_SUFFIXES.has(catalogToken.slice(queryToken.length))
  ) {
    return true
  }

  if (queryToken.length >= 6 && catalogToken.length >= 6) {
    const distance = editDistance(queryToken, catalogToken)
    if (distance > 0 && distance <= 2) return true
  }

  return false
}

/**
 * Lower is better. 0 = exact merge key.
 * Returns null when the names should not be treated as the same product.
 *
 * Matching is conservative on purpose: character overlap previously merged
 * unrelated foods (ranskankerma → mansikkamehu). Extra catalog tokens such as
 * a brand or package size are allowed; extra query tokens are not.
 */
export const scoreCatalogNameMatch = (
  query: string,
  catalogName: string
): number | null => {
  const queryKey = pantryItemMergeKey(query)
  const catalogKey = pantryItemMergeKey(catalogName)
  if (!queryKey || !catalogKey) return null
  if (queryKey === catalogKey) return 0
  if (queryKey.length < 4) return null

  const queryTokens = tokenizeFoodName(query)
  const catalogTokens = tokenizeFoodName(catalogName)
  if (!queryTokens.length || !catalogTokens.length) return null

  const allQueryMatched = queryTokens.every((queryToken) =>
    catalogTokens.some((catalogToken) => tokensMatch(queryToken, catalogToken))
  )
  if (!allQueryMatched) return null

  const extra = catalogTokens.filter(
    (catalogToken) =>
      !queryTokens.some((queryToken) => tokensMatch(queryToken, catalogToken))
  ).length
  return 1 + extra
}

export const findBestCatalogMatch = <T extends { name: string }>(
  query: string,
  catalog: T[]
): T | null => {
  const hits = catalog
    .map((item) => ({
      item,
      score: scoreCatalogNameMatch(query, item.name),
    }))
    .filter(
      (hit): hit is { item: T; score: number } => hit.score !== null
    )

  if (!hits.length) return null

  hits.sort((a, b) => a.score - b.score)
  const bestScore = hits[0].score
  const top = hits.filter((hit) => hit.score === bestScore)
  if (top.length === 1) return top[0].item
  if (bestScore === 0) return top[0].item
  return null
}
