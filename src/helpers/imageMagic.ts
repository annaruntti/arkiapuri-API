import fs from "fs"

const readPrefix = (filePath: string, length: number): Buffer => {
  const fd = fs.openSync(filePath, "r")
  try {
    const buffer = Buffer.alloc(length)
    const bytesRead = fs.readSync(fd, buffer, 0, length, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    fs.closeSync(fd)
  }
}

const isJpeg = (bytes: Buffer) =>
  bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff

const isPng = (bytes: Buffer) =>
  bytes.length >= 8 &&
  bytes[0] === 0x89 &&
  bytes[1] === 0x50 &&
  bytes[2] === 0x4e &&
  bytes[3] === 0x47 &&
  bytes[4] === 0x0d &&
  bytes[5] === 0x0a &&
  bytes[6] === 0x1a &&
  bytes[7] === 0x0a

/** HEIC/HEIF typically start with size + 'ftyp' + brand. */
const isHeicFamily = (bytes: Buffer) => {
  if (bytes.length < 12) return false
  if (bytes.toString("ascii", 4, 8) !== "ftyp") return false
  const brand = bytes.toString("ascii", 8, 12).toLowerCase()
  return (
    brand === "heic" ||
    brand === "heif" ||
    brand === "mif1" ||
    brand === "msf1" ||
    brand === "heim" ||
    brand === "heis"
  )
}

/**
 * Reject uploads whose content does not match an allowed image signature.
 * Call after multer writes the temp file; unlink on failure in the caller.
 */
export const assertImageMagicBytes = (filePath: string): void => {
  const bytes = readPrefix(filePath, 16)
  if (isJpeg(bytes) || isPng(bytes) || isHeicFamily(bytes)) return
  throw new Error("File content is not a supported image type")
}
