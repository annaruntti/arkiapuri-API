// Migration script to drop the problematic unique index on invitations.invitationCode
// Run this once to fix existing database

const mongoose = require("mongoose")
require("dotenv").config()

async function dropInvitationCodeIndex() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log("Connected to MongoDB")

    const db = mongoose.connection.db
    const collection = db.collection("households")

    // Get existing indexes
    const indexes = await collection.indexes()
    console.log("Existing indexes:", indexes.map((i) => i.name))

    // Drop the problematic index if it exists
    try {
      await collection.dropIndex("invitations.invitationCode_1")
      console.log("✅ Dropped invitations.invitationCode_1 index")
    } catch (error) {
      if (error.code === 27) {
        console.log("Index doesn't exist (already dropped or never created)")
      } else {
        throw error
      }
    }

    console.log("Migration completed successfully!")
    process.exit(0)
  } catch (error) {
    console.error("Migration failed:", error)
    process.exit(1)
  }
}

dropInvitationCodeIndex()

