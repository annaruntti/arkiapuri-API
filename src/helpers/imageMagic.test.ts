import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import { assertImageMagicBytes } from "./imageMagic"

const writeTemp = (bytes: Buffer) => {
  const filePath = path.join(
    os.tmpdir(),
    `arkiapuri-magic-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`
  )
  fs.writeFileSync(filePath, bytes)
  return filePath
}

describe("assertImageMagicBytes", () => {
  it("accepts JPEG and PNG signatures", () => {
    const jpeg = writeTemp(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))
    const png = writeTemp(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
    try {
      assert.doesNotThrow(() => assertImageMagicBytes(jpeg))
      assert.doesNotThrow(() => assertImageMagicBytes(png))
    } finally {
      fs.unlinkSync(jpeg)
      fs.unlinkSync(png)
    }
  })

  it("rejects non-image payloads", () => {
    const text = writeTemp(Buffer.from("<?php echo 1;"))
    try {
      assert.throws(() => assertImageMagicBytes(text), /supported image/)
    } finally {
      fs.unlinkSync(text)
    }
  })
})
