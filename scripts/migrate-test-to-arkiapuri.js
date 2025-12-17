// Script to migrate data from 'test' database to 'arkiapuri' database
// This will copy all collections from test to arkiapuri

const mongoose = require("mongoose")
require("dotenv").config()

async function migrateData() {
  try {
    // Connect to test database
    const testUri = process.env.MONGODB_URI.replace("/arkiapuri?", "/test?")
    await mongoose.connect(testUri)
    console.log("✅ Connected to TEST database")

    const testDb = mongoose.connection.db
    const collections = await testDb.listCollections().toArray()
    
    console.log(`\nFound ${collections.length} collections to migrate:`)
    collections.forEach(col => console.log(`  - ${col.name}`))

    // Connect to arkiapuri database
    const arkiapuriUri = process.env.MONGODB_URI
    const arkiapuriClient = mongoose.connection.getClient()
    const arkiapuriDb = arkiapuriClient.db('arkiapuri')
    console.log("\n✅ Connected to ARKIAPURI database")

    // Migrate each collection
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name
      console.log(`\n📦 Migrating ${collectionName}...`)

      const sourceCollection = testDb.collection(collectionName)
      const targetCollection = arkiapuriDb.collection(collectionName)

      // Get all documents from source
      const documents = await sourceCollection.find({}).toArray()
      console.log(`   Found ${documents.length} documents`)

      if (documents.length > 0) {
        // Clear existing data in target (optional - comment out if you want to merge)
        await targetCollection.deleteMany({})
        console.log(`   Cleared existing data in arkiapuri.${collectionName}`)

        // Insert all documents into target
        await targetCollection.insertMany(documents)
        console.log(`   ✅ Migrated ${documents.length} documents`)
      } else {
        console.log(`   ⏭️  Skipped (empty collection)`)
      }
    }

    console.log("\n✅ Migration completed successfully!")
    console.log("\nYou can now update your MONGODB_URI to use 'arkiapuri' database")
    
    process.exit(0)
  } catch (error) {
    console.error("❌ Migration failed:", error)
    process.exit(1)
  }
}

migrateData()

