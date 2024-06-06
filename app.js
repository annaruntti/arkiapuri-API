const express = require("express")
require("dotenv").config()
require("./src/models/db")

// const userRouter = require("./src/routes/user");

const User = require("./src/models/user")

const app = express()

// app.use((req, res, next) => {
//   req.on('data', chunk => {
//     const data = JSON.parse(chunk);
//     req.body = data;
//     next();
//   });
// });

app.use(express.json())
// app.use(userRouter);

// const test = async (email, password) => {
//   const user = await User.findOne({ email: email });
//   const result = await user.comparePassword(password);
//   console.log(result);
// };

// test('testi@testi.fi', 'Maija Meikäläinen');

const email = "testi1@testi.fi"

app.post("/create-user", async (req, res) => {
  const isNewUser = await User.isThisEmailInUse(email)
  if (!isNewUser)
    return res.json({
      success: false,
      message:
        "This email is already in use, try sign-in with a different email",
    })
  const user = await User({
    username: "Maija Meikäläinen",
    email: email,
    password: "testi1234",
  })
  await user.save()
  res.json(user)
})

app.get("/test", (req, res) => {
  res.send("Hello world")
})

app.get("/", (req, res) => {
  res.json({ success: true, message: "Testi testi" })
})

app.listen(8000, () => {
  console.log("port is listening")
})
