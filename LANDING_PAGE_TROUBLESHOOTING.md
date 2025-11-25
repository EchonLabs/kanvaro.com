# Landing Page Images Troubleshooting Guide

## Issue: Images not showing on landing page

### Step 1: Check if images are saved in the database

Visit the debug page: `http://localhost:3000/landing/debug`

This page will:
- Show you what images are currently saved
- Let you save the Cloudinary images with one click
- Test if images can load
- Show any errors

### Step 2: Save the images to the database

You need to save the Cloudinary URLs to the database. You can do this in several ways:

#### Option A: Use the Debug Page (Easiest)
1. Go to: `http://localhost:3000/landing/debug`
2. Click "Save Cloudinary Images" button
3. Wait for success message
4. Go back to landing page and refresh

#### Option B: Use Browser Console (After logging in)
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

#### Option C: Use the HTML Tool
1. Visit: `http://localhost:3000/set-landing-images.html`
2. Click "Set All Images"
3. Refresh landing page

### Step 3: Restart Next.js Server

**IMPORTANT:** After updating `next.config.js`, you MUST restart your Next.js development server:

1. Stop the server (Ctrl+C)
2. Run `npm run dev` again
3. Clear browser cache or do a hard refresh (Ctrl+Shift+R)

### Step 4: Check Browser Console

Open browser console (F12) and check for:
- Any errors loading images
- Network tab to see if images are being fetched
- Console logs from the landing page

### Step 5: Verify Image URLs

Make sure the Cloudinary URLs are accessible:
- Try opening them directly in a browser
- Check if they return 200 OK status
- Verify URLs don't have typos

## Common Issues

### Issue: "Failed to fetch landing page images"
- **Solution:** Check if database is connected
- Check server logs for errors
- Verify API endpoint is accessible

### Issue: "Insufficient permissions"
- **Solution:** Make sure you're logged in as an admin user
- Check user permissions in the system

### Issue: Images show as broken
- **Solution:** 
  1. Restart Next.js server (config changed)
  2. Check if Cloudinary URLs are correct
  3. Verify `next.config.js` has Cloudinary domain configured
  4. Check browser console for CORS errors

### Issue: Images saved but not showing
- **Solution:**
  1. Hard refresh browser (Ctrl+Shift+R)
  2. Check browser console for errors
  3. Verify images are actually in database (use debug page)
  4. Check network tab to see if images are loading

## Configuration Changes Made

✅ Updated `next.config.js` to allow Cloudinary images:
```javascript
images: {
  remotePatterns: [
    {
      protocol: 'https',
      hostname: 'res.cloudinary.com',
      pathname: '/**',
    },
  ],
}
```

✅ Set all images to `unoptimized={true}` to bypass Next.js optimization for external URLs

✅ Added console logging for debugging

## Still Not Working?

1. Check the debug page: `/landing/debug`
2. Check browser console for errors
3. Check server logs
4. Verify images are saved in MongoDB
5. Try accessing a Cloudinary URL directly in browser
