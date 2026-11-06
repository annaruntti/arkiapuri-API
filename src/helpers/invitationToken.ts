/** UUID v4 shape matching crypto.randomUUID(). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Normalize and validate an invitation token from untrusted input.
 * Rejects objects/arrays (NoSQL operator injection) and non-UUID strings.
 */
export const parseInvitationToken = (
  value: unknown
): { ok: true; token: string } | { ok: false; message: string } => {
  if (value === undefined || value === null || value === "") {
    return { ok: false, message: "Kutsukoodi vaaditaan" }
  }
  if (typeof value !== "string") {
    return { ok: false, message: "Virheellinen kutsukoodi" }
  }
  const token = value.trim()
  if (!UUID_RE.test(token)) {
    return { ok: false, message: "Virheellinen kutsukoodi" }
  }
  return { ok: true, token }
}
