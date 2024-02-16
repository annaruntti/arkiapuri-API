const mongoose = require("mongoose")

const FamilyMember = mongoose.model("FamilyMember", {
  name: String,
  author: String,
  id: String,
})

module.exports = { FamilyMember }
