export const normalizeRecipeSteps = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((step) => String(step || "").trim())
    .filter(Boolean)
}

export const joinRecipeSteps = (steps: string[]): string =>
  steps.map((step, index) => `${index + 1}. ${step}`).join("\n")

export const hasRecipeContent = (
  steps: string[],
  recipe?: string
): boolean => steps.length > 0 || Boolean(String(recipe || "").trim())
