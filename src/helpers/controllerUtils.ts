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
