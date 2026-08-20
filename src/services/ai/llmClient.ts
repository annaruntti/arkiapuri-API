import { getAiConfig } from "./config"
import type { LlmStructuredRequest, LlmStructuredResult } from "./types"

export class AiNotConfiguredError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not configured")
    this.name = "AiNotConfiguredError"
  }
}

export class AiResponseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AiResponseError"
  }
}

const estimateCostUsd = (inputTokens: number, outputTokens: number): number => {
  const config = getAiConfig()
  return (
    (inputTokens / 1_000_000) * config.inputUsdPerMillion +
    (outputTokens / 1_000_000) * config.outputUsdPerMillion
  )
}

const parseJsonPayload = (text: string): unknown => {
  const trimmed = String(text || "").trim()
  if (!trimmed) {
    throw new AiResponseError("Empty model response")
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf("{")
    const end = trimmed.lastIndexOf("}")
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1))
    }
    throw new AiResponseError("Model did not return JSON")
  }
}

export const completeStructured = async <T>(
  request: LlmStructuredRequest
): Promise<LlmStructuredResult<T>> => {
  const config = getAiConfig()
  if (!config.apiKey) {
    throw new AiNotConfiguredError()
  }

  const { GoogleGenAI } = await import("@google/genai")
  const model = request.model || config.model
  const ai = new GoogleGenAI({ apiKey: config.apiKey })

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [{ text: request.user }]
  if (request.image?.base64) {
    parts.push({
      inlineData: {
        mimeType: request.image.mimeType || "image/jpeg",
        data: request.image.base64,
      },
    })
  }

  let response
  try {
    response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: request.system,
        responseMimeType: "application/json",
        responseSchema: request.schema,
        maxOutputTokens: request.maxOutputTokens ?? 8192,
      },
    })
  } catch (error: unknown) {
    console.error("Gemini generateContent error:", error)
    const message = error instanceof Error ? error.message : String(error)
    if (/no longer available|NOT_FOUND|not found/i.test(message)) {
      throw new AiResponseError(
        `AI-malli ${model} ei ole käytettävissä. Päivitä AI_MODEL .env-tiedostossa.`
      )
    }
    throw new AiResponseError(
      "Tuotteiden tunnistus epäonnistui. Yritä uudelleen toisella kuvalla."
    )
  }

  const text = response.text || ""
  const data = parseJsonPayload(text) as T
  const inputTokens = Number(response.usageMetadata?.promptTokenCount) || 0
  const outputTokens = Number(response.usageMetadata?.candidatesTokenCount) || 0

  return {
    data,
    model,
    inputTokens,
    outputTokens,
    estimatedCostUsd: estimateCostUsd(inputTokens, outputTokens),
  }
}

/** Gemini schema for pantry scan structured output. */
export const pantryScanResponseSchema = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          confidence: { type: "NUMBER" },
          quantityGuess: { type: "NUMBER" },
          unit: { type: "STRING" },
          category: { type: "STRING" },
          notes: { type: "STRING" },
        },
        required: ["name", "confidence"],
      },
    },
  },
  required: ["items"],
}
