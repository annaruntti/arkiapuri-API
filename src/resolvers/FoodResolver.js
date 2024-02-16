// FoodModal that defined for MongoDB Food Schema.
const Food = require("../models/FoodModal")

const FoodResolver = {
  Query: {
    getAllFoods: async (parent, args, context, info) => {
      return await Food.find().populate("author")
    },

    getSingleFood: async (parent, args, context, info) => {
      return await Food.findById(args.id).populate("author")
    },

    getFoodsByAuthor: async (parent, args, context, info) => {
      let foods = await Food.find({ author: args.id })
      return foods
    },
  },

  Mutation: {
    createFood: async (parent, args, context, info) => {
      const food = new Food(args.food)

      await food.save()

      return food
    },

    updateFood: async (parent, args, context, info) => {
      const { id } = args

      const food = await Food.findByIdAndUpdate(id, args.food)

      return food
    },

    deleteFood: async (parent, args, context, info) => {
      const { id } = args

      await Food.findByIdAndDelete(id)

      console.log("Food deleted successfully")

      return "Food deleted successfully"
    },

    deleteAllFoods: async (parent, args, context, info) => {
      await Food.deleteMany()

      return "Foods deleted successfully"
    },
  },
}

module.exports = FoodResolver
