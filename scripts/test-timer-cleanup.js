/**
 * Script to test the timer cleanup cron job
 * 
 * Usage:
 *   node scripts/test-timer-cleanup.js
 * 
 * This script will:
 * 1. Call the timer cleanup endpoint
 * 2. Display the results
 * 3. Help verify that expired timers are being stopped correctly
 */

const CRON_SECRET = process.env.CRON_SECRET
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

async function testTimerCleanup() {
  console.log('🕐 Testing Timer Cleanup Cron Job...\n')
  console.log(`Endpoint: ${BASE_URL}/api/cron/timer-cleanup`)
  console.log(`Using Auth: ${CRON_SECRET ? 'Yes' : 'No'}\n`)

  try {
    const headers = {
      'Content-Type': 'application/json'
    }

    if (CRON_SECRET) {
      headers['Authorization'] = `Bearer ${CRON_SECRET}`
    }

    const response = await fetch(`${BASE_URL}/api/cron/timer-cleanup`, {
      method: 'GET',
      headers
    })

    console.log(`Status: ${response.status} ${response.statusText}\n`)

    if (!response.ok) {
      const error = await response.text()
      console.error('❌ Error:', error)
      process.exit(1)
    }

    const data = await response.json()

    console.log('✅ Success!\n')
    console.log('Summary:')
    console.log('─────────────────────────────')
    console.log(`Total Checked: ${data.summary?.totalChecked || 0}`)
    console.log(`Stopped: ${data.summary?.stopped || 0}`)
    console.log(`Skipped: ${data.summary?.skipped || 0}`)
    console.log(`Errors: ${data.summary?.errors || 0}`)
    console.log('─────────────────────────────\n')

    if (data.results && data.results.length > 0) {
      console.log('Results:')
      console.log('─────────────────────────────')
      data.results.forEach((result, index) => {
        console.log(`\n${index + 1}. Timer ID: ${result.timerId}`)
        console.log(`   Status: ${result.status}`)
        if (result.user) console.log(`   User: ${result.user}`)
        if (result.project) console.log(`   Project: ${result.project}`)
        if (result.duration !== undefined) console.log(`   Duration: ${result.duration} minutes`)
        if (result.error) console.log(`   Error: ${result.error}`)
      })
      console.log('\n─────────────────────────────')
    }

    console.log(`\n${data.message}`)
    
  } catch (error) {
    console.error('❌ Failed to test timer cleanup:', error.message)
    process.exit(1)
  }
}

// Run the test
testTimerCleanup()
