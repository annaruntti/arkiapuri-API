const mongoose = require("mongoose")

mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
  })
  .then(() => {
    console.log("Connected to MongoDB Atlas")
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error)
    process.exit(1)
  })
