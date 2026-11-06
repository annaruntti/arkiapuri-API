import crypto from "crypto"

/** RFC 7636 S256 PKCE pair for OAuth authorization-code flows. */
export const createPkcePair = (): { verifier: string; challenge: string } => {
  const verifier = crypto.randomBytes(32).toString("base64url")
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url")
  return { verifier, challenge }
}
