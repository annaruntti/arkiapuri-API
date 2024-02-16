const mongoose = require("mongoose")

const Author = mongoose.model("Author", {
  name: String,
  description: String,
  email: String,
  id: String,
})

module.exports = { Author }
