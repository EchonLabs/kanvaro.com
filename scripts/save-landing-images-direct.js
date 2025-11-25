/**
 * Direct MongoDB script to save landing page images
 * Run with: node scripts/save-landing-images-direct.js
 * 
 * This script connects directly to MongoDB and saves the images
 * Useful if the API endpoint has permission issues
 */

require('dotenv').config({ path: '.env.local' })
const mongoose = require('mongoose')

const images = {
  heroDashboard: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044927/EL-Core-Assets/Static/Kanvaro/he_1_xqkbdw.png",
  showcaseImages: {
    tasks: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044930/EL-Core-Assets/Static/Kanvaro/2_ocdtse.png",
    projects: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044930/EL-Core-Assets/Static/Kanvaro/6_n6p2bu.png",
    members: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044929/EL-Core-Assets/Static/Kanvaro/5_1_dpjhwk.png",
    timeLogs: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044928/EL-Core-Assets/Static/Kanvaro/4_jwnslu.png",
    reports: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044929/EL-Core-Assets/Static/Kanvaro/1_qpvyfp.png"
  },
  stepImages: {
    step1: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044928/EL-Core-Assets/Static/Kanvaro/3_1_benfd7.png",
    step2: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044928/EL-Core-Assets/Static/Kanvaro/7_a8ky5x.png",
    step3: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044929/EL-Core-Assets/Static/Kanvaro/1_qpvyfp.png"
  }
}

async function saveImages() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI
    
    if (!mongoUri) {
      console.error('❌ MONGODB_URI not found in environment variables')
      process.exit(1)
    }

    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(mongoUri)
    console.log('✅ Connected\n')

    // Import the Organization model
    const Organization = mongoose.model('Organization', new mongoose.Schema({}, { strict: false }))
    
    // Find or create organization
    let org = await Organization.findOne()
    
    if (!org) {
      console.log('📝 Creating new organization...')
      org = await Organization.create({
        name: 'Kanvaro',
        timezone: 'UTC',
        currency: 'USD',
        language: 'en',
        size: 'small',
        settings: {
          allowSelfRegistration: false,
          requireEmailVerification: true,
          defaultUserRole: 'team_member'
        },
        billing: {
          plan: 'free',
          maxUsers: 5,
          maxProjects: 3,
          features: []
        }
      })
      console.log('✅ Created organization:', org._id)
    } else {
      console.log('✅ Found organization:', org._id)
    }

    // Update with landing page images
    console.log('\n📸 Saving landing page images...')
    org.landingPageImages = images
    await org.save()

    console.log('✅ Images saved successfully!')
    console.log('\n📋 Saved images:')
    console.log('  Hero:', images.heroDashboard ? '✅' : '❌')
    console.log('  Steps:', Object.values(images.stepImages).filter(Boolean).length, '/ 3')
    console.log('  Showcases:', Object.values(images.showcaseImages).filter(Boolean).length, '/ 5')

    await mongoose.disconnect()
    console.log('\n👋 Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error)
    process.exit(1)
  }
}

saveImages()
