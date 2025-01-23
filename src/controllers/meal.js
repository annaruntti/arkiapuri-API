const Meal = require("../models/meal")

exports.createMeal = async (req, res) => {
  const { name, recipe, foodItems } = req.body

  const meal = new Meal({
    name,
    recipe,
    foodItems,
  })

  await meal.save()
  res.json({ success: true, meal })
}

exports.getMeals = async (req, res) => {
  const meals = await Meal.find().populate("foodItems")
  res.json({ success: true, meals })
}
