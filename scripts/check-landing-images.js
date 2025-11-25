/**
 * Script to check if landing page images are set in the database
 * Run with: node scripts/check-landing-images.js
 */

const mongoose = require('mongoose')
require('dotenv').config({ path: '.env.local' })

async function checkLandingImages() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI
    
    if (!mongoUri) {
      console.error('❌ MONGODB_URI not found in environment variables')
      console.log('Please set MONGODB_URI in your .env.local file')
      process.exit(1)
    }

    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(mongoUri)
    console.log('✅ Connected to MongoDB\n')

    const Organization = mongoose.model('Organization', new mongoose.Schema({}, { strict: false }))
    
    const org = await Organization.findOne()
    
    if (!org) {
      console.log('❌ No organization found in database')
      await mongoose.disconnect()
      process.exit(0)
    }

    const landingImages = org.landingPageImages || {}
    
    console.log('📸 Landing Page Images Status:\n')
    console.log('Hero Dashboard:', landingImages.heroDashboard || '❌ Not set')
    console.log('')
    console.log('Step Images:')
    console.log('  Step 1:', landingImages.stepImages?.step1 || '❌ Not set')
    console.log('  Step 2:', landingImages.stepImages?.step2 || '❌ Not set')
    console.log('  Step 3:', landingImages.stepImages?.step3 || '❌ Not set')
    console.log('')
    console.log('Showcase Images:')
    console.log('  Tasks:', landingImages.showcaseImages?.tasks || '❌ Not set')
    console.log('  Projects:', landingImages.showcaseImages?.projects || '❌ Not set')
    console.log('  Members:', landingImages.showcaseImages?.members || '❌ Not set')
    console.log('  Time Logs:', landingImages.showcaseImages?.timeLogs || '❌ Not set')
    console.log('  Reports:', landingImages.showcaseImages?.reports || '❌ Not set')
    
    const hasAnyImages = 
      landingImages.heroDashboard ||
      landingImages.stepImages?.step1 ||
      landingImages.stepImages?.step2 ||
      landingImages.stepImages?.step3 ||
      landingImages.showcaseImages?.tasks ||
      landingImages.showcaseImages?.projects ||
      landingImages.showcaseImages?.members ||
      landingImages.showcaseImages?.timeLogs ||
      landingImages.showcaseImages?.reports

    if (!hasAnyImages) {
      console.log('\n⚠️  No images are set!')
      console.log('Please use the API endpoint or the HTML tool to set images.')
    } else {
      console.log('\n✅ Some images are set!')
    }

    await mongoose.disconnect()
    console.log('\n👋 Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

checkLandingImages()
