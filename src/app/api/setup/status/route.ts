import { NextResponse } from 'next/server'
import { isSetupCompleted, loadConfig } from '@/lib/config'
import connectDB from '@/lib/db-config'
import { User } from '@/models/User'

export async function GET() {
  try {
    const config = loadConfig()
    console.log('config for prod issue fix', config)
    // Check if there are actually users in the database
    let hasUsers = false
    try {
      await connectDB()
      const userCount = await User.countDocuments()
      console.log('userCount for prod issue fix', userCount)
      hasUsers = userCount > 0
      console.log('hasUsers for prod issue fix', hasUsers)
    } catch (error) {
      console.log('Database connection failed, assuming no users:', error)
    }
    
    // Setup is completed if config says so and we didn't positively detect an empty user collection
    const setupCompleted = config.setupCompleted && hasUsers !== false
    console.log('setupCompleted for prod issue fix', setupCompleted)
    return NextResponse.json({
      setupCompleted,
      hasConfig: !!config.database,
      hasUsers,
      organizationId: config.organizationId,
      message: setupCompleted 
        ? 'Application is configured and ready' 
        : hasUsers 
          ? 'Application setup is required' 
          : 'No users found, setup required'
    })
  } catch (error) {
    console.log('error for prod issue fix', error)
    console.error('Failed to check setup status:', error)
    return NextResponse.json({
      setupCompleted: false,
      hasConfig: false,
      hasUsers: false,
      message: 'Failed to check setup status'
    })
  }
}