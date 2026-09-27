import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  assignOpenPricesToFoodItem,
  convertQuantity,
  estimateLinePrice,
  foodIndexMultiplierFromTable,
  priceFromOpenPricesObservations,
  shoppingListDisplayTotal,
  type FoodPriceSource,
  type HistoryPrice,
} from "./priceEstimate"

type OpenPricesTarget = {
  price: number
  priceSource?: FoodPriceSource
}

const foodHistory = (
  overrides: Partial<HistoryPrice> = {}
): HistoryPrice => ({
  kind: "food",
  foodId: "food-1",
  name: "Banaani",
  price: 4,
  quantity: 1,
  unit: "kg",
  priceSource: "user",
  ...overrides,
})

describe("estimateLinePrice", () => {
  it("uses household history before the category baseline", () => {
    const estimate = estimateLinePrice(
      {
        name: "Banaani",
        foodId: "food-1",
        quantity: 0.5,
        unit: "kg",
        isFood: true,
        category: ["Kasvikset"],
      },
      { history: [foodHistory()], cpiMultiplier: 1 }
    )
    assert.deepEqual(estimate, {
      priceEstimate: 2,
      priceEstimateSource: "history",
      priceFromOpenPrices: false,
    })
  })

  it("skips history when the unit does not match", () => {
    const estimate = estimateLinePrice(
      {
        name: "Banaani",
        foodId: "food-1",
        quantity: 0.5,
        unit: "kg",
        isFood: true,
      },
      {
        history: [foodHistory({ unit: "kpl", price: 3, quantity: 1 })],
        cpiMultiplier: 1,
      }
    )
    assert.equal(estimate?.priceEstimateSource, "category")
    assert.equal(estimate?.priceEstimate, 1)
  })

  it("converts a category price into the line unit", () => {
    const estimate = estimateLinePrice(
      {
        name: "Banaanit",
        quantity: 500,
        unit: "g",
        isFood: true,
      },
      { cpiMultiplier: 1 }
    )
    assert.equal(estimate?.priceEstimateSource, "category")
    assert.equal(estimate?.priceEstimate, 1)
  })

  it("does not guess a kilogram price for a piece without a package size", () => {
    const estimate = estimateLinePrice(
      {
        name: "Pihvi",
        quantity: 1,
        unit: "kpl",
        category: ["Liha"],
        isFood: true,
      },
      { cpiMultiplier: 1 }
    )
    assert.equal(estimate, null)
  })

  it("scales a piece price when the package size is known", () => {
    const converted = convertQuantity(2, "kpl", "kg", 250, "g")
    assert.equal(converted, 0.5)
  })

  it("leaves a user-entered price untouched", () => {
    const estimate = estimateLinePrice(
      {
        name: "Maito",
        quantity: 1,
        unit: "l",
        price: 1.89,
        isFood: true,
      },
      { history: [foodHistory({ name: "Maito", unit: "l", price: 0.8 })] }
    )
    assert.equal(estimate, null)
  })

  it("does not category-price non-food items", () => {
    const estimate = estimateLinePrice({
      name: "Maito",
      quantity: 1,
      unit: "l",
      isFood: false,
    })
    assert.equal(estimate, null)
  })

  it("applies the food price index to a category estimate", () => {
    const estimate = estimateLinePrice(
      { name: "Maito", quantity: 1, unit: "l", isFood: true },
      { cpiMultiplier: 2 }
    )
    assert.equal(estimate?.priceEstimate, 2.3)
  })

  it("scales a package-priced food history entry by quantity", () => {
    const estimate = estimateLinePrice(
      {
        name: "Kahvi",
        foodId: "food-1",
        quantity: 2,
        unit: "kpl",
        isFood: true,
      },
      {
        history: [
          foodHistory({
            name: "Kahvi",
            price: 4,
            quantity: 1,
            unit: "kpl",
            priceSource: "user",
          }),
        ],
        cpiMultiplier: 1,
      }
    )
    assert.equal(estimate?.priceEstimate, 8)
    assert.equal(estimate?.priceEstimateSource, "history")
  })
})

describe("Open Prices", () => {
  it("requires three observations", () => {
    assert.equal(
      priceFromOpenPricesObservations([{ price: 1 }, { price: 2 }]),
      null
    )
    assert.equal(
      priceFromOpenPricesObservations([
        { price: 1 },
        { price: 2 },
        { price: 3 },
      ]),
      2
    )
  })

  it("drops discounted prices when enough regular prices remain", () => {
    const median = priceFromOpenPricesObservations([
      { price: 1, priceIsDiscounted: true },
      { price: 2 },
      { price: 3 },
      { price: 4 },
    ])
    assert.equal(median, 3)
  })

  it("writes a price only when the food item has none", () => {
    const empty: OpenPricesTarget = { price: 0 }
    assert.equal(assignOpenPricesToFoodItem(empty, 2.4), true)
    assert.equal(empty.price, 2.4)
    assert.equal(empty.priceSource, "open-prices")

    const priced: OpenPricesTarget = { price: 5, priceSource: "user" }
    assert.equal(assignOpenPricesToFoodItem(priced, 2.4), false)
    assert.equal(priced.price, 5)
    assert.equal(priced.priceSource, "user")

    const stillEmpty: OpenPricesTarget = { price: 0 }
    assert.equal(assignOpenPricesToFoodItem(stillEmpty, null), false)
    assert.equal(stillEmpty.price, 0)
    assert.equal(stillEmpty.priceSource, undefined)
  })
})

describe("food price index", () => {
  it("compares the latest index with the baseline month", () => {
    const multiplier = foodIndexMultiplierFromTable(
      {
        data: [
          { key: ["2026M07"], values: ["99"] },
          { key: ["2026M08"], values: ["100"] },
          { key: ["2026M09"], values: ["102"] },
        ],
      },
      "2026-08"
    )
    assert.equal(multiplier, 1.02)
  })
})

describe("shoppingListDisplayTotal", () => {
  it("keeps a manual total only when no line has a price", () => {
    assert.equal(
      shoppingListDisplayTotal([{ price: 0 }, { priceEstimate: 0 }], 12),
      12
    )
    assert.equal(
      shoppingListDisplayTotal(
        [{ price: 2 }, { price: 0, priceEstimate: 3 }],
        12
      ),
      5
    )
  })
})
