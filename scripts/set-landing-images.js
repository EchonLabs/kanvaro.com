/**
 * Script to set landing page images from Cloudinary URLs
 * Run with: node scripts/set-landing-images.js
 */

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

async function setLandingImages() {
  try {
    // Note: This requires authentication. In production, you would need to:
    // 1. Log in via the UI and use the API from the browser console
    // 2. Or create an admin script with proper authentication
    
    console.log('To set these images, make a PUT request to /api/landing-page/images with the following payload:')
    console.log(JSON.stringify(images, null, 2))
    console.log('\nOr use the browser console after logging in:')
    console.log(`
fetch('/api/landing-page/images', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(${JSON.stringify(images, null, 2)})
}).then(r => r.json()).then(console.log)
    `)
  } catch (error) {
    console.error('Error:', error)
  }
}

setLandingImages()
