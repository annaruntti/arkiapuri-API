const { gql } = require("apollo-server-express")
const FoodTypeDef = gql`
  # Author
  type Author {
    id: ID
    authorName: String
    description: String
    email: String
  }
  # Food
  type Food {
    id: ID
    title: String
    description: String
    date: String
    author: Author
  }
  type Query {
    getAllFoods: [Food]
    getFoodsByAuthor(id: ID): [Food]
    getSingleFood(id: ID): Food
  }
  input FoodInput {
    title: String
    description: String
    date: Int
    author: String
  }
  type Mutation {
    createFood(food: FoodInput): Food
    updateFood(id: String, food: FoodInput): Food
    deleteFood(id: String): String
    deleteAllFoods: String
  }
`

module.exports = FoodTypeDef
