import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { parseQuantity, sanitizeBarcode, sanitizeHttpUrl } from "./controllerUtils"

describe("sanitizeHttpUrl", () => {
  it("keeps http and https URLs", () => {
    assert.equal(
      sanitizeHttpUrl("https://images.openfoodfacts.org/foo.jpg"),
      "https://images.openfoodfacts.org/foo.jpg"
    )
    assert.equal(sanitizeHttpUrl("http://example.com/a.png"), "http://example.com/a.png")
  })

  it("rejects javascript, data, and credentialed URLs", () => {
    assert.equal(sanitizeHttpUrl("javascript:alert(1)"), undefined)
    assert.equal(sanitizeHttpUrl("data:image/png;base64,abc"), undefined)
    assert.equal(sanitizeHttpUrl("https://user:pass@evil.test/x"), undefined)
  })
})

describe("sanitizeBarcode", () => {
  it("keeps plausible EAN digits", () => {
    assert.equal(sanitizeBarcode("6411234567890"), "6411234567890")
  })

  it("drops too-short or empty values", () => {
    assert.equal(sanitizeBarcode("123"), undefined)
    assert.equal(sanitizeBarcode(""), undefined)
  })
})

describe("parseQuantity", () => {
  it("parses Finnish decimals", () => {
    assert.equal(parseQuantity("0,33"), 0.33)
  })
})
