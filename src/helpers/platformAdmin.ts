import type { IUser } from "../models/user"

export type PlatformRole = "user" | "admin"

const normalizeEmail = (email: string): string => email.trim().toLowerCase()

/** Parse PLATFORM_ADMIN_EMAILS (comma-separated, case-insensitive). */
export const getPlatformAdminEmails = (): Set<string> => {
  const raw = process.env.PLATFORM_ADMIN_EMAILS || ""
  const emails = raw
    .split(",")
    .map((value) => normalizeEmail(value))
    .filter(Boolean)
  return new Set(emails)
}

export const isPlatformAdminEmail = (email: string | undefined | null): boolean => {
  if (!email) return false
  return getPlatformAdminEmails().has(normalizeEmail(email))
}

export const resolvePlatformRole = (
  email: string | undefined | null
): PlatformRole => (isPlatformAdminEmail(email) ? "admin" : "user")

/**
 * Keep user.platformRole in sync with PLATFORM_ADMIN_EMAILS (source of truth).
 * Persists only when the role changed.
 */
export const syncPlatformRoleForUser = async (user: IUser): Promise<IUser> => {
  const nextRole = resolvePlatformRole(user.email)
  const current = (user.platformRole as PlatformRole) || "user"
  if (current === nextRole) return user

  user.platformRole = nextRole
  await user.save()
  return user
}
