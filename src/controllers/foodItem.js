const FoodItem = require("../models/foodItem")

exports.createFoodItem = async (req, res) => {
  const { name, category, quantity, expireDay, price, calories } = req.body

  const foodItem = new FoodItem({
    name,
    category,
    quantity,
    expireDay,
    price,
    calories,
  })

  await foodItem.save()
  res.json({ success: true, foodItem })
}

exports.getFoodItems = async (req, res) => {
  const foodItems = await FoodItem.find()
  res.json({ success: true, foodItems })
}
