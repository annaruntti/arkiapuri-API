const express = require("express")
require("dotenv").config()
require("./src/models/db")

const userRouter = require("./src/routes/user")

const User = require("./src/models/user")

const app = express()

// app.use((req, res, next) => {
//   req.on("data", (chunk) => {
//     const data = JSON.parse(chunk)
//     req.body = data
//     next()
//   })
// })

// app.get("/test", (req, res) => {
//   res.send("Testi1")
// })

app.use(express.json())

app.use(userRouter)

const test = async (email, password) => {
  const user = await User.findOne({ email: email })
  const result = await user.comparePassword(password)
  console.log(result)
}

app.get("/test", (req, res) => {
  res.send("Hello world")
})

app.get("/", (req, res) => {
  res.json({ success: true, message: "Testi testi" })
})

app.listen(8000, () => {
  console.log("port is listening")
})
