// Script to fix user household references
// Run this to link your existing user to their household

const mongoose = require("mongoose")
require("dotenv").config()

const User = require("../src/models/user")
const Household = require("../src/models/household")

async function fixUserHouseholdReferences() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log("Connected to MongoDB")

    // Find all households
    const households = await Household.find()
    console.log(`Found ${households.length} households`)

    let fixed = 0
    for (const household of households) {
      // Get all member user IDs
      const memberIds = household.members.map((m) => m.userId)

      // Update all members to have this household reference
      for (const userId of memberIds) {
        const user = await User.findById(userId)
        if (user && (!user.household || user.household.toString() !== household._id.toString())) {
          user.household = household._id
          await user.save()
          console.log(`✅ Fixed household reference for user ${user.username} (${user._id})`)
          fixed++
        }
      }
    }

    console.log(`\n✅ Fixed ${fixed} user household references`)
    process.exit(0)
  } catch (error) {
    console.error("Script failed:", error)
    process.exit(1)
  }
}

fixUserHouseholdReferences()

