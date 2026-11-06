/** Providers accepted by POST /auth/social (demo is intentionally excluded). */
export const SOCIAL_ID_TOKEN_PROVIDERS = new Set(["google"] as const)

export const isSocialIdTokenProvider = (provider: unknown): provider is "google" =>
  typeof provider === "string" && SOCIAL_ID_TOKEN_PROVIDERS.has(provider as "google")
