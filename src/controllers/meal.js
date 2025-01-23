const Meal = require("../models/meal")

exports.createMeal = async (req, res) => {
  const { name, recipe, difficultyLevel, cookingTime, foodItems } = req.body

  // Validate foodItems
  const validFoodItems = await FoodItem.find({ _id: { $in: foodItems } })
  if (validFoodItems.length !== foodItems.length) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid food items" })
  }

  const meal = new Meal({
    name,
    recipe,
    difficultyLevel,
    cookingTime,
    foodItems,
  })

  await meal.save()
  res.json({ success: true, meal })
}

exports.getMeals = async (req, res) => {
  const meals = await Meal.find().populate("foodItems")
  res.json({ success: true, meals })
}
