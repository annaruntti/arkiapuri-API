import { Request, Response } from "express"
import { getErrorMessage } from "../helpers/controllerUtils"

// google-cloud/vision is consumed as CJS namespace (not a default export)
const vision = require("@google-cloud/vision")

const client = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
})

export const analyzeImage = async (
  req: Request<Record<string, string>, unknown, { image?: string }>,
  res: Response
) => {
  try {
    const { image } = req.body

    if (!image) {
      return res.status(400).json({
        success: false,
        message: "No image provided",
      })
    }

    const buffer = Buffer.from(image, "base64")

    const [textResult, objectResult, labelResult] = await Promise.all([
      client.textDetection(buffer),
      client.objectLocalization(buffer),
      client.labelDetection(buffer),
    ])

    res.json({
      success: true,
      textAnnotations: textResult[0].textAnnotations,
      localizedObjectAnnotations: objectResult[0].localizedObjectAnnotations,
      labelAnnotations: labelResult[0].labelAnnotations,
    })
  } catch (error: unknown) {
    console.error("Vision API Error:", error)
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    })
  }
}
