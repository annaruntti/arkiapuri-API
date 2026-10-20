export const toCalendarDayKey = (value?: string | Date | null): string | null => {
  if (value == null || value === "") return null
  const raw = typeof value === "string" ? value.trim() : ""
  const dayOnly = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  if (dayOnly && (raw.length === 10 || /T00:00:00/.test(raw))) {
    return dayOnly[1]
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

export const toUtcMidnight = (dayKey: string): string => `${dayKey}T00:00:00.000Z`

export const normalizeMealDate = (value?: string | Date | null): string | null => {
  const day = toCalendarDayKey(value)
  return day ? toUtcMidnight(day) : null
}

export const normalizeMealDates = (
  values?: Array<string | Date> | null
): string[] => {
  if (!Array.isArray(values)) return []
  return [
    ...new Set(
      values
        .map((value) => normalizeMealDate(value))
        .filter((value): value is string => Boolean(value))
    ),
  ]
}

export const clampEatingDatesToCooking = (
  eatingDates: string[],
  cookingDate?: string | Date | null
): string[] => {
  const cookingKey = toCalendarDayKey(cookingDate)
  if (!cookingKey) return eatingDates
  return [
    ...new Set(
      eatingDates.map((date) => {
        const day = toCalendarDayKey(date)
        if (!day) return date
        return day < cookingKey ? toUtcMidnight(cookingKey) : date
      })
    ),
  ]
}

export const normalizeServings = (value: unknown): number => {
  const parsed = parseInt(String(value ?? ""), 10)
  if (!Number.isFinite(parsed) || parsed < 1) return 4
  return parsed
}
