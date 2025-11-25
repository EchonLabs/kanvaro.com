# Setting Landing Page Images from Cloudinary

## Quick Setup

To set the Cloudinary images on the landing page, run this command in your browser console (after logging in as an admin):

```javascript
fetch('/api/landing-page/images', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
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
  })
}).then(r => r.json()).then(console.log)
```

## Image Mapping

- **Hero Dashboard**: Main hero section preview
- **Showcase Images**:
  - Tasks: Task management showcase
  - Projects: Project management showcase  
  - Members: Team management showcase
  - TimeLogs: Time tracking showcase
  - Reports: Reporting dashboard showcase
- **Step Images**:
  - Step 1: Blueprint & Import
  - Step 2: Collaborate in Context (Sprint related)
  - Step 3: Forecast & Celebrate (Dashboard)

## Features Added

✅ Modern hover effects with smooth transitions
✅ Image overlays on hover for better visual feedback
✅ Step indicators on step images
✅ Enhanced shadows and borders
✅ Smooth scale animations
✅ Live dashboard indicator on hero image
✅ Responsive design maintained
