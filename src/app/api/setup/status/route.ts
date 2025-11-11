import { NextResponse } from 'next/server'
import { isSetupCompleted, loadConfig } from '@/lib/config'
import connectDB from '@/lib/db-config'
import { User } from '@/models/User'

export async function GET() {
  try {
    const config = loadConfig()
    
    // Check if there are actually users in the database
    let hasUsers: boolean | null = null
    try {
      await connectDB()
      const userCount = await User.countDocuments()
      hasUsers = userCount > 0
    } catch (error) {
      console.log('Database connection failed while checking users:', error)
    }
    
    // Setup is completed if config says so and we didn't positively detect an empty user collection
    const setupCompleted = config.setupCompleted && hasUsers !== false
    
    return NextResponse.json({
      setupCompleted,
      hasConfig: !!config.database,
      hasUsers,
      organizationId: config.organizationId,
      message: setupCompleted 
        ? 'Application is configured and ready' 
        : hasUsers === false
          ? 'Application setup is required' 
          : 'Unable to verify users, setup status unknown'
    })
  } catch (error) {
    console.error('Failed to check setup status:', error)
    return NextResponse.json({
      setupCompleted: false,
      hasConfig: false,
      hasUsers: false,
      message: 'Failed to check setup status'
    })
  }
}