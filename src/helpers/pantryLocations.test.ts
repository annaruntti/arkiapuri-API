import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  DEFAULT_PANTRY_LOCATIONS,
  assignLocationsFromStorageCategories,
  ensureDefaultPantryLocations,
  inferLocationTypeFromCategories,
  itemLocationKey,
  locationIdString,
  nextPantryLocationName,
  sameLocationId,
  syncStorageCategoryForLocation,
} from "./pantryLocations"

const fakePantry = (locations: unknown[] = []) =>
  ({
    locations,
    set(field: string, value: unknown) {
      ;(this as Record<string, unknown>)[field] = value
    },
  }) as unknown as import("../models/pantry").IPantry

describe("locationIdString", () => {
  it("normalizes object ids and empty values", () => {
    assert.equal(locationIdString("abc"), "abc")
    assert.equal(locationIdString({ _id: "abc" }), "abc")
    assert.equal(locationIdString(null), null)
    assert.equal(locationIdString(""), null)
    assert.equal(
      locationIdString({ toHexString: () => "507f1f77bcf86cd799439011" }),
      "507f1f77bcf86cd799439011"
    )
  })
})

describe("sameLocationId", () => {
  it("treats missing ids as the same unlocated bucket", () => {
    assert.equal(sameLocationId(null, undefined), true)
    assert.equal(sameLocationId("a", "a"), true)
    assert.equal(sameLocationId("a", "b"), false)
  })
})

describe("ensureDefaultPantryLocations", () => {
  it("seeds the three default locations once", () => {
    const pantry = fakePantry([])
    assert.equal(ensureDefaultPantryLocations(pantry), true)
    assert.equal(pantry.locations.length, 3)
    assert.deepEqual(
      pantry.locations.map((location) => location.name),
      DEFAULT_PANTRY_LOCATIONS.map((location) => location.name)
    )
    assert.equal(ensureDefaultPantryLocations(pantry), false)
  })
})

describe("nextPantryLocationName", () => {
  it("appends a number when the default name is taken", () => {
    assert.equal(nextPantryLocationName("cupboard", []), "Kuivakaappi")
    assert.equal(
      nextPantryLocationName("cupboard", ["Kuivakaappi"]),
      "Kuivakaappi 2"
    )
    assert.equal(
      nextPantryLocationName("cupboard", ["Kuivakaappi", "Kuivakaappi 2"]),
      "Kuivakaappi 3"
    )
  })
})

describe("itemLocationKey", () => {
  it("uses none when the item has no location", () => {
    assert.equal(itemLocationKey({ locationId: null }), "none")
    assert.equal(itemLocationKey({ locationId: "loc-1" as never }), "loc-1")
  })
})

describe("inferLocationTypeFromCategories", () => {
  it("maps Säilytys categories to location types", () => {
    assert.equal(
      inferLocationTypeFromCategories(["Jääkaappituotteet", "Maitotuotteet"]),
      "fridge"
    )
    assert.equal(inferLocationTypeFromCategories(["8"]), "freezer")
    assert.equal(inferLocationTypeFromCategories(["22"]), "cupboard")
    assert.equal(
      inferLocationTypeFromCategories(["Pakasteet", "Jääkaappituotteet"]),
      "freezer"
    )
    assert.equal(inferLocationTypeFromCategories(["Maitotuotteet"]), null)

    assert.deepEqual(
      syncStorageCategoryForLocation(["Maitotuotteet", "Pakasteet"], "fridge"),
      ["Maitotuotteet", "Jääkaappituotteet"]
    )
  })

  it("assigns unlocated pantry items from Säilytys categories", () => {
    const pantry = {
      locations: [
        { _id: "loc-fridge", type: "fridge", name: "Jääkaappi" },
        { _id: "loc-freezer", type: "freezer", name: "Pakastin" },
      ],
      items: [
        { name: "Maito", category: ["Jääkaappituotteet"], locationId: null },
        { name: "Herne", category: ["Pakasteet"], locationId: null },
        { name: "Riisi", category: ["Kuiva-aineet"], locationId: null },
        {
          name: "Already",
          category: ["Jääkaappituotteet"],
          locationId: "keep-me",
        },
      ],
    } as unknown as import("../models/pantry").IPantry

    assert.equal(assignLocationsFromStorageCategories(pantry), true)
    assert.equal(String(pantry.items[0].locationId), "loc-fridge")
    assert.equal(String(pantry.items[1].locationId), "loc-freezer")
    assert.equal(pantry.items[2].locationId, null)
    assert.equal(String(pantry.items[3].locationId), "keep-me")
  })
})
