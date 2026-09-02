import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  findBestCatalogMatch,
  scoreCatalogNameMatch,
  tokenizeFoodName,
} from "./foodNameMatch"

describe("tokenizeFoodName", () => {
  it("strips packaging suffixes", () => {
    assert.deepEqual(tokenizeFoodName("vesipullo"), ["vesi"])
    assert.deepEqual(tokenizeFoodName("kivennäisvesipullo"), ["kivennäisvesi"])
  })
})

describe("scoreCatalogNameMatch", () => {
  it("treats the same merge key as an exact match", () => {
    assert.equal(scoreCatalogNameMatch("Kevyt maito", "Kevytmaito"), 0)
  })

  it("does not match kana to kaneli", () => {
    assert.equal(scoreCatalogNameMatch("kana", "kaneli"), null)
  })

  it("does not match paprika to paprikajauhe", () => {
    assert.equal(scoreCatalogNameMatch("paprika", "paprikajauhe"), null)
    assert.equal(scoreCatalogNameMatch("paprikoita", "paprikajauhe"), null)
    assert.equal(scoreCatalogNameMatch("paprikajauhe", "paprika"), null)
  })

  it("matches paprika inflections to paprika", () => {
    assert.equal(typeof scoreCatalogNameMatch("paprikat", "paprika"), "number")
    assert.equal(typeof scoreCatalogNameMatch("paprikaa", "paprika"), "number")
  })

  it("does not match ranskankerma to mansikkamehu", () => {
    assert.equal(scoreCatalogNameMatch("ranskankerma", "mansikkamehu"), null)
  })

  it("does not match rasvaton maito to kevyt maito", () => {
    assert.equal(scoreCatalogNameMatch("rasvaton maito", "kevyt maito"), null)
  })

  it("allows extra catalog brand tokens", () => {
    const score = scoreCatalogNameMatch(
      "kivennäisvesi",
      "Novelle kivennäisvesi"
    )
    assert.equal(typeof score, "number")
    assert.ok((score as number) > 0)
  })

  it("allows extra query brand tokens", () => {
    const score = scoreCatalogNameMatch(
      "Valio rasvaton maito",
      "rasvaton maito"
    )
    assert.equal(typeof score, "number")
    assert.ok((score as number) > 0)
  })

  it("matches packaging forms to the drink name", () => {
    const score = scoreCatalogNameMatch(
      "kivennäisvesipullo",
      "Novelle kivennäisvesi pullo"
    )
    assert.equal(typeof score, "number")
  })

  it("matches vesipullo to kivennäisvesi via the compound head", () => {
    const score = scoreCatalogNameMatch("vesipullo", "Novelle kivennäisvesi")
    assert.equal(typeof score, "number")
  })
})

describe("findBestCatalogMatch", () => {
  it("returns a unique extra-token match", () => {
    const match = findBestCatalogMatch("kivennäisvesi", [
      { name: "Novelle kivennäisvesi" },
    ])
    assert.equal(match?.name, "Novelle kivennäisvesi")
  })

  it("returns a unique vesipullo match", () => {
    const match = findBestCatalogMatch("vesipullo", [
      { name: "Novelle kivennäisvesi" },
    ])
    assert.equal(match?.name, "Novelle kivennäisvesi")
  })

  it("returns null when several catalog items match equally", () => {
    const match = findBestCatalogMatch("kivennäisvesi", [
      { name: "Novelle kivennäisvesi" },
      { name: "Pirkka kivennäisvesi" },
    ])
    assert.equal(match, null)
  })

  it("prefers an exact merge-key hit over a branded extra-token hit", () => {
    const match = findBestCatalogMatch("kivennäisvesi", [
      { name: "Kivennäisvesi" },
      { name: "Novelle kivennäisvesi" },
    ])
    assert.equal(match?.name, "Kivennäisvesi")
  })

  it("prefers the branded catalog row when the query includes the brand", () => {
    const match = findBestCatalogMatch("Novelle kivennäisvesi", [
      { name: "Kivennäisvesi" },
      { name: "Novelle kivennäisvesi" },
    ])
    assert.equal(match?.name, "Novelle kivennäisvesi")
  })
})
