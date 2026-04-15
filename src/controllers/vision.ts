const vision = require("@google-cloud/vision")

// Create Google Vision client
const client = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
})

exports.analyzeImage = async (req, res) => {
  try {
    const { image } = req.body

    if (!image) {
      return res.status(400).json({
        success: false,
        message: "No image provided",
      })
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(image, "base64")

    // Perform multiple detection types in parallel
    const [textResult, objectResult, labelResult] = await Promise.all([
      client.textDetection(buffer),
      client.objectLocalization(buffer),
      client.labelDetection(buffer),
    ])

    const response = {
      textAnnotations: textResult[0].textAnnotations,
      localizedObjectAnnotations: objectResult[0].localizedObjectAnnotations,
      labelAnnotations: labelResult[0].labelAnnotations,
    }

    res.json({
      success: true,
      ...response,
    })
  } catch (error) {
    console.error("Vision API Error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}
