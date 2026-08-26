import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  findCatalogMatchByAppearance,
  VISUAL_MATCH_EVAL_TRIGGER,
} from "./visualProductMatch"

describe("findCatalogMatchByAppearance", () => {
  it("stays disabled until back-of-pack eval says otherwise", async () => {
    assert.equal(VISUAL_MATCH_EVAL_TRIGGER.tag, "back-of-pack")
    const match = await findCatalogMatchByAppearance({
      imageBase64: "",
      catalog: [{ _id: "1", name: "Novelle kivennäisvesi" }],
    })
    assert.equal(match, null)
  })
})
