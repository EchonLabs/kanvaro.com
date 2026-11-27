import { NextResponse } from 'next/server'
import { rejectUnlessDevAdmin } from '@/lib/debug-guard'
import connectDB from '@/lib/db-config'
import { User } from '@/models/User'

export async function GET() {
  try {
    const denied = await rejectUnlessDevAdmin()
    if (denied) return denied

    const db = await connectDB()
    console.log('Database connection state:', db.connection.readyState)
    
    // Ensure connection is ready
    if (db.connection.readyState !== 1) {
      console.log('Waiting for database connection to be ready...')
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Database connection timeout'))
        }, 10000)
        
        const checkConnection = () => {
          if (db.connection.readyState === 1) {
            clearTimeout(timeout)
            resolve(true)
          } else {
            setTimeout(checkConnection, 100)
          }
        }
        checkConnection()
      })
    }
    
    console.log('Database connection is ready, fetching users...')
    const users = await User.find({}, { 
      firstName: 1, 
      lastName: 1, 
      email: 1, 
      role: 1, 
      isActive: 1,
      createdAt: 1 
    }).sort({ createdAt: -1 })
    
    return NextResponse.json({
      success: true,
      count: users.length,
      users: users.map(user => ({
        id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt
      }))
    })
  } catch (error) {
    console.error('Failed to get users:', error)
    return NextResponse.json(
      { 
        error: 'Failed to get users',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
