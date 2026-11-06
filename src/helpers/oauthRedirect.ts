/**
 * Resolve OAuth redirect base URLs from env (no hardcoded localhost in prod).
 */
export const mobileAuthRedirectBase = (): string =>
  (process.env.MOBILE_REDIRECT_URI || "arkiapuri://auth/callback").replace(
    /\/$/,
    ""
  )

export const webAuthRedirectBase = (): string =>
  (
    process.env.WEB_REDIRECT_URI ||
    process.env.WEB_URL ||
    "http://localhost:8081/AuthCallback"
  ).replace(/\/$/, "")

export const buildOAuthRedirectUrl = (
  isMobile: boolean,
  params: Record<string, string | undefined>
): string => {
  const base = isMobile ? mobileAuthRedirectBase() : webAuthRedirectBase()
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, value)
  }
  const qs = search.toString()
  return qs ? `${base}?${qs}` : base
}
