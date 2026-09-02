export const MAX_AI_IMAGE_CHARS = 7_000_000
export const ALLOWED_AI_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
])

export type ParsedAiImage = {
  base64: string
  mimeType: string
}

const stripDataUri = (value: string): { base64: string; mimeType?: string } => {
  const match = String(value || "").match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
  )
  if (match) {
    return { mimeType: match[1], base64: match[2] }
  }
  return { base64: String(value || "").replace(/\s/g, "") }
}

export const parseAiImageBody = (body: {
  image?: string
  mimeType?: string
}):
  | { ok: true; image: ParsedAiImage }
  | { ok: false; status: number; message: string } => {
  const rawImage = body?.image
  if (!rawImage || typeof rawImage !== "string") {
    return { ok: false, status: 400, message: "Kuva puuttuu" }
  }

  const parsed = stripDataUri(rawImage)
  const mimeType = (
    body.mimeType ||
    parsed.mimeType ||
    "image/jpeg"
  ).toLowerCase()
  if (!ALLOWED_AI_IMAGE_MIME.has(mimeType)) {
    return {
      ok: false,
      status: 400,
      message:
        "Kuvan tyyppi ei ole tuettu. Käytä JPEG-, PNG-, WebP- tai HEIC-kuvaa.",
    }
  }
  if (parsed.base64.length > MAX_AI_IMAGE_CHARS) {
    return {
      ok: false,
      status: 413,
      message: "Kuva on liian suuri. Pienennä kuvaa ja yritä uudelleen.",
    }
  }

  return { ok: true, image: { base64: parsed.base64, mimeType } }
}
