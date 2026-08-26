import { Request } from "express"
import type { IUser } from "../models/user"

interface ModelModule<T> {
  default?: T
}

type ResolvableModule<T> = ModelModule<T> | T | null | undefined

export const resolveModule = <T>(module: ResolvableModule<T>): T =>
  (module as ModelModule<T>)?.default || (module as T)

export type AuthenticatedRequest<
  P = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>
> = Request<P, ResBody, ReqBody, ReqQuery> & { user: IUser }

export const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error"

export const isCloudinaryConfigured = (): boolean =>
  Boolean(
    process.env.CLOUDINARY_USER_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      (process.env.CLOUDINARY_API_SECRET ||
        process.env.CLOUDINARY_API_KEY_SECRET)
  )

export const sanitizeHttpUrl = (value?: string | null): string | undefined => {
  const url = String(value || "").trim()
  if (!url || url.length > 2048) return undefined
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined
    }
    if (parsed.username || parsed.password) return undefined
    return url
  } catch {
    return undefined
  }
}

export const sanitizeBarcode = (value?: string | null): string | undefined => {
  const digits = String(value || "").replace(/\D/g, "")
  if (digits.length < 8 || digits.length > 14) return undefined
  return digits
}

export interface ParseQuantityOptions {
  fallback?: number
  min?: number
}

export const parseQuantity = (
  value: number | string | undefined,
  options: ParseQuantityOptions = {}
): number => {
  const { fallback = 1, min } = options
  if (value === undefined || value === null || value === "") return fallback
  const parsed =
    typeof value === "number"
      ? value
      : parseFloat(String(value).trim().replace(/\s/g, "").replace(",", "."))
  if (!Number.isFinite(parsed)) return fallback
  if (min !== undefined && parsed < min) return fallback
  return parsed
}
