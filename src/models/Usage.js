const mongoose = require("mongoose")

const usageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  month: {
    type: Number,
    required: true,
  },
  year: {
    type: Number,
    required: true,
  },
  requests: {
    type: Number,
    default: 0,
  },
  lastRequest: {
    type: Date,
    default: Date.now,
  },
})

module.exports = mongoose.model("Usage", usageSchema)
