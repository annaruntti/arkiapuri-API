const mongoose = require("mongoose")

const Food = mongoose.model("Food", {
  title: String,
  foodscription: String,
  author: String,
  foodId: String,
})

module.exports = { Food }
