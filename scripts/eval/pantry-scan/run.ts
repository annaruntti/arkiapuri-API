import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { pantryItemMergeKey } from "../../../src/helpers/pantryHelpers"
import { normalizePantryDetections } from "../../../src/services/ai/productNormalizer"
import { scanPantryImage } from "../../../src/services/ai/useCases/pantryScan"
import { getAiConfig } from "../../../src/services/ai/config"

type Fixture = {
  id: string
  file: string
  tags: string[]
  notes?: string
  expected: string[]
}

type Score = {
  id: string
  model: string
  predicted: string[]
  expected: string[]
  tp: number
  fp: number
  fn: number
  precision: number
  recall: number
  skipped?: string
  tags: string[]
}

const ROOT =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url))
const IMAGES_DIR = path.join(ROOT, "images")
const EXPECTED_PATH = path.join(ROOT, "expected.json")

const asKeys = (names: string[]): Set<string> =>
  new Set(names.map((name) => pantryItemMergeKey(name)).filter(Boolean))

const scoreNames = (
  predicted: string[],
  expected: string[]
): Pick<Score, "tp" | "fp" | "fn" | "precision" | "recall"> => {
  const pred = asKeys(predicted)
  const gold = asKeys(expected)
  let tp = 0
  for (const key of pred) {
    if (gold.has(key)) tp += 1
  }
  const fp = pred.size - tp
  const fn = gold.size - tp
  const precision = pred.size ? tp / pred.size : 0
  const recall = gold.size ? tp / gold.size : 0
  return { tp, fp, fn, precision, recall }
}

const pct = (value: number): string => `${(value * 100).toFixed(0)}%`

const printTable = (rows: Score[]) => {
  const header = [
    "id".padEnd(4),
    "model".padEnd(22),
    "P".padStart(4),
    "R".padStart(4),
    "ok".padStart(3),
    "tags",
  ].join("  ")
  console.log(header)
  console.log("-".repeat(80))
  for (const row of rows) {
    const ok = row.skipped ? "-" : row.fn === 0 && row.fp === 0 ? "✓" : "✗"
    console.log(
      [
        row.id.padEnd(4),
        (row.skipped || row.model).slice(0, 22).padEnd(22),
        pct(row.precision).padStart(4),
        pct(row.recall).padStart(4),
        ok.padStart(3),
        row.tags.join(","),
      ].join("  ")
    )
    if (!row.skipped && (row.fp > 0 || row.fn > 0)) {
      console.log(
        `     expected: ${row.expected.join(", ")} | predicted: ${row.predicted.join(", ") || "(none)"}`
      )
    }
  }

  const ran = rows.filter((row) => !row.skipped)
  if (!ran.length) return
  const precision =
    ran.reduce((sum, row) => sum + row.precision, 0) / ran.length
  const recall = ran.reduce((sum, row) => sum + row.recall, 0) / ran.length
  console.log("-".repeat(80))
  console.log(
    `Macro precision ${pct(precision)}  recall ${pct(recall)}  n=${ran.length}`
  )
}

const readImage = (file: string): { base64: string; mimeType: string } | null => {
  const full = path.join(IMAGES_DIR, file)
  if (!fs.existsSync(full)) return null
  const ext = path.extname(file).toLowerCase()
  const mimeType =
    ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg"
  return {
    base64: fs.readFileSync(full).toString("base64"),
    mimeType,
  }
}

const main = async () => {
  const fixtures = JSON.parse(
    fs.readFileSync(EXPECTED_PATH, "utf8")
  ) as Fixture[]
  const normalizerOnly = process.argv.includes("--normalizer-only")
  const compareModel = process.env.AI_EVAL_COMPARE_MODEL
  const models = normalizerOnly
    ? []
    : [getAiConfig().model, compareModel].filter(
        (model, index, all): model is string =>
          Boolean(model) && all.indexOf(model) === index
      )

  if (normalizerOnly) {
    console.log("Normalizer-only: predicted = expected (merge-key sanity)\n")
    const rows: Score[] = fixtures.map((fixture) => {
      const normalized = normalizePantryDetections(
        fixture.expected.map((name) => ({ name, confidence: 1 }))
      )
      const predicted = normalized.map((item) => item.name)
      return {
        id: fixture.id,
        model: "normalizer",
        predicted,
        expected: fixture.expected,
        tags: fixture.tags,
        ...scoreNames(predicted, fixture.expected),
      }
    })
    printTable(rows)
    return
  }

  if (!getAiConfig().apiKey) {
    console.error("GEMINI_API_KEY puuttuu. Aja --normalizer-only tai aseta avain.")
    process.exit(1)
  }

  const rows: Score[] = []
  for (const fixture of fixtures) {
    const image = readImage(fixture.file)
    if (!image) {
      rows.push({
        id: fixture.id,
        model: "missing-image",
        predicted: [],
        expected: fixture.expected,
        tp: 0,
        fp: 0,
        fn: fixture.expected.length,
        precision: 0,
        recall: 0,
        skipped: "no-image",
        tags: fixture.tags,
      })
      continue
    }

    for (const model of models) {
      try {
        const result = await scanPantryImage({ image, model })
        const predicted = result.items.map((item) => item.name)
        rows.push({
          id: fixture.id,
          model,
          predicted,
          expected: fixture.expected,
          tags: fixture.tags,
          ...scoreNames(predicted, fixture.expected),
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        rows.push({
          id: fixture.id,
          model,
          predicted: [],
          expected: fixture.expected,
          tp: 0,
          fp: 0,
          fn: fixture.expected.length,
          precision: 0,
          recall: 0,
          skipped: message.slice(0, 22),
          tags: fixture.tags,
        })
      }
    }
  }

  printTable(rows)
  const missing = rows.filter((row) => row.skipped === "no-image").length
  if (missing) {
    console.log(
      `\n${missing} kuvaa puuttuu kansiosta scripts/eval/pantry-scan/images/ (01.jpg–25.jpg).`
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
