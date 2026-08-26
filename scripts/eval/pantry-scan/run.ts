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

type TagSummary = {
  tag: string
  n: number
  precision: number
  recall: number
}

type EvalReport = {
  ranAt: string
  enrich: boolean
  models: string[]
  fixtureCount: number
  ranCount: number
  skippedCount: number
  macroPrecision: number
  macroRecall: number
  byTag: TagSummary[]
  rows: Score[]
}

const ROOT =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url))
const IMAGES_DIR = path.join(ROOT, "images")
const RESULTS_DIR = path.join(ROOT, "results")
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

const average = (rows: Score[], key: "precision" | "recall"): number => {
  if (!rows.length) return 0
  return rows.reduce((sum, row) => sum + row[key], 0) / rows.length
}

const summarizeByTag = (rows: Score[]): TagSummary[] => {
  const ran = rows.filter((row) => !row.skipped)
  const byTag = new Map<string, Score[]>()
  for (const row of ran) {
    for (const tag of row.tags) {
      const list = byTag.get(tag) || []
      list.push(row)
      byTag.set(tag, list)
    }
  }
  return [...byTag.entries()]
    .map(([tag, tagged]) => ({
      tag,
      n: tagged.length,
      precision: average(tagged, "precision"),
      recall: average(tagged, "recall"),
    }))
    .sort((a, b) => a.tag.localeCompare(b.tag, "fi"))
}

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
  console.log("-".repeat(80))
  console.log(
    `Macro precision ${pct(average(ran, "precision"))}  recall ${pct(average(ran, "recall"))}  n=${ran.length}`
  )

  const byTag = summarizeByTag(rows)
  if (!byTag.length) return
  console.log("\nBy tag")
  console.log(
    ["tag".padEnd(18), "n".padStart(3), "P".padStart(4), "R".padStart(4)].join(
      "  "
    )
  )
  console.log("-".repeat(40))
  for (const row of byTag) {
    console.log(
      [
        row.tag.padEnd(18),
        String(row.n).padStart(3),
        pct(row.precision).padStart(4),
        pct(row.recall).padStart(4),
      ].join("  ")
    )
  }
}

const writeReport = (report: EvalReport): string => {
  fs.mkdirSync(RESULTS_DIR, { recursive: true })
  const stamp = report.ranAt.replace(/[:.]/g, "-")
  const datedPath = path.join(RESULTS_DIR, `eval-${stamp}.json`)
  const latestPath = path.join(RESULTS_DIR, "latest.json")
  const json = `${JSON.stringify(report, null, 2)}\n`
  fs.writeFileSync(datedPath, json)
  fs.writeFileSync(latestPath, json)
  return datedPath
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
  const enrich = process.argv.includes("--enrich")
  const compareModel = process.env.AI_EVAL_COMPARE_MODEL
  const models = normalizerOnly
    ? []
    : [getAiConfig().model, compareModel].filter(
        (model, index, all): model is string =>
          Boolean(model) && all.indexOf(model) === index
      )

  let rows: Score[] = []

  if (normalizerOnly) {
    console.log("Normalizer-only: predicted = expected (merge-key sanity)\n")
    rows = fixtures.map((fixture) => {
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
  } else {
    if (!getAiConfig().apiKey) {
      console.error(
        "GEMINI_API_KEY puuttuu. Aja --normalizer-only tai aseta avain."
      )
      process.exit(1)
    }

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
          const result = await scanPantryImage({
            image,
            model,
            enrich,
          })
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
  }

  printTable(rows)

  const ran = rows.filter((row) => !row.skipped)
  const report: EvalReport = {
    ranAt: new Date().toISOString(),
    enrich: normalizerOnly ? false : enrich,
    models: normalizerOnly ? ["normalizer"] : models,
    fixtureCount: fixtures.length,
    ranCount: ran.length,
    skippedCount: rows.length - ran.length,
    macroPrecision: average(ran, "precision"),
    macroRecall: average(ran, "recall"),
    byTag: summarizeByTag(rows),
    rows,
  }
  const reportPath = writeReport(report)
  console.log(`\nWrote ${path.relative(process.cwd(), reportPath)}`)

  const missing = rows.filter((row) => row.skipped === "no-image").length
  if (missing) {
    console.log(
      `\n${missing} kuvaa puuttuu kansiosta scripts/eval/pantry-scan/images/ (01.jpg–30.jpg).`
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
