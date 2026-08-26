# Pantry scanner evaluation

Run this evaluation to improve how accurately pantry scan works for users. It uses the same pipeline as `POST /ai/pantry-scan` (default model `gemini-3.5-flash-lite`) and shows whether a prompt, model, or catalog / Open Food Facts change would make product names more reliable in the app.

Keep the photo set and scoring the same between runs. Change the prompt, model, or review threshold only when a new report shows a real gain.

## Photo set (30 images)

Put photos in `images/` as `01.jpg` … `30.jpg`. Expected product names are in `expected.json`. Photos are gitignored (size and privacy); the directory keeps a `.gitkeep`.

Cover scenes that fail in real use:

- a single product vs a full fridge
- poor lighting and reflections
- partly occluded packaging
- dry-goods cupboard, freezer, and vegetable drawer
- a photo taken from far away
- **same-sku:** `26.jpg` is the front of a bottle with readable text; `27.jpg` is the back of the same bottle

Do not include people in the photos. Use real fridge or pantry contents, with the same kinds of products the app sees in production.

### Same-sku pair (26–27)

This pair shows whether the back of a known pack can be matched after the front has been catalogued — a common case when someone photographs a bottle from the wrong side.

1. Add the product to the household catalog once from a readable label (for example a branded mineral water).
2. Use `26.jpg` for the front of the pack and `27.jpg` for the back.
3. Run once without enrichment (Gemini names only) and again with `--enrich` (catalog / Open Food Facts lookup).
4. Visual embedding search is [out of scope](#phase-2-visual-embedding-search) until `back-of-pack` recall stays at zero even with `--enrich`.

## How to run

From the `arkiapuri-API` repository root:

```bash
# Name matching only (no photos and no Gemini key)
npm run eval:pantry-scan -- --normalizer-only

# Gemini without catalog / Open Food Facts lookup
npm run eval:pantry-scan

# Same photos with catalog and Open Food Facts lookup
# (same-sku: a generic water bottle can resolve to a catalog brand)
npm run eval:pantry-scan -- --enrich

# Compare Lite vs Flash
AI_EVAL_COMPARE_MODEL=gemini-3.5-flash npm run eval:pantry-scan
```

To use the scan endpoint locally without Stripe, set `AI_GRANT_PREMIUM=true`.

Each run writes:

- `results/latest.json`
- `results/eval-<ISO-timestamp>.json`

Compare two runs (prompt A/B or Lite vs Flash) from these files.

## Metrics

Precision = correctly identified / names the model returned (false suggestions lower the score)  
Recall = correctly identified / expected names (missed products lower the score)

Names are normalized with the pantry merge key (`"Kevyt maito"` ≈ `"Kevytmaito"`).

The console and JSON report scores **by tag** (for example `poor-lighting`, `occlusion`, `far`, `back-of-pack`). A single accuracy number is misleading because a full fridge dominates the average. Use the tags to see which real-world situations got better or worse.

## Review preselection

The app review UI (`PantryScanReview`) preselects a row when:

- `confidence >= 0.35`, **or**
- the name matched the household catalog or Open Food Facts (`matchSource` is `catalog` / `openfoodfacts`)

Low-confidence detections without a known product stay unchecked so the user can confirm new or uncertain names. The rule lives in the frontend at `arkiapuri/src/utils/scanReviewSelect.js`.

Change the 0.35 threshold only after a new `results/` run with per-tag metrics.

## Phase 2: visual embedding search

Do not implement this until same-sku back-of-pack photos (`27`, tag `back-of-pack`) still score zero recall with `--enrich`.

Then: crop the pack from the photo, compare it to household `FoodItem.image` files (CLIP or Gemini embeddings), and suggest `foodId` in review. Do not add the item to the pantry silently — two similar bottles can be different products.

The hook is a no-op in `src/services/ai/visualProductMatch.ts`.
