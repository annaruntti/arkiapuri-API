const express = require("express")
const mongoose = require("mongoose")
const { ApolloServer } = require("apollo-server-express")
//Resolvers
const FoodResolver = require("./src/resolvers/FoodResolver")
const AuthorResolver = require("./src/resolvers/AuthorResolver")
const FamilyMemberResolver = require("./src/resolvers/FamilyMemberResolver")

// const types = loadFilesSync(path.join(__dirname, "."), {
//   extensions: ["gql"],
// })

//Type Defs
const AuthorTypedef = require("./src/typesDefs/AuthorTypeDef")
const FoodTypedef = require("./src/typesDefs/FoodTypeDef")
const FamilyMemberTypedef = require("./src/typesDefs/FamilyMemberTypeDef")

// function to create graphql apollo server
async function startServer() {
  const app = express()
  const apolloServer = new ApolloServer({
    typeDefs: [FoodTypedef, AuthorTypedef, FamilyMemberTypedef],
    resolvers: [FoodResolver, AuthorResolver, FamilyMemberResolver],
    context: async ({ reg }) => {},
  })
  // Start grapql server
  await apolloServer.start()
  // Apply express (app) as middleware
  await apolloServer.applyMiddleware({ app: app })
  // MongoDb database connection
  await mongoose.connect("mongodb://localhost:27017/pantry_db", {
    useUnifiedTopology: true,
    useNewUrlParser: true,
  })
  console.log("Mongodb connected ........")
  app.listen(4000, () => {
    console.log("Server is running on port: 4000")
    startServer()
  })
}
startServer()

// const app = express()
// //Establish database connection
// const connectDb = async () => {
//   await mongoose
//     .connect("mongodb://localhost:27017/pantry_db", {
//       useUnifiedTopology: true,
//       useNewUrlParser: true,
//     })
//     .then(() => {
//       console.log("DB connected successfully....")
//     })
//     .catch(() => {
//       console.log("DB connection failed...")
//     })
// }
// connectDb()
// //listening server on port 4000
// app.listen(4000, () => {
//   console.log("Server is running on port: 4000")
// })
