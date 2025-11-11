import { NextResponse } from 'next/server'
import { hasDatabaseConfig, getDatabaseConfig } from '@/lib/db-config'
import { loadConfig } from '@/lib/config'

export async function GET() {
  try {
    console.log('Checking database configuration...')
    
    const hasConfig = await hasDatabaseConfig()
    console.log('Has database config:', hasConfig)
    
    if (!hasConfig) {
      return NextResponse.json({
        success: false,
        hasConfig: false,
        message: 'No database configuration found. Please complete the setup process.'
      })
    }

    const config = await getDatabaseConfig()
    const appConfig = loadConfig()
    
    console.log('Database config retrieved:', {
      host: config.host,
      port: config.port,
      database: config.database,
      username: config.username
    })

    return NextResponse.json({
      success: true,
      hasConfig: true,
      setupCompleted: appConfig.setupCompleted,
      organizationId: appConfig.organizationId,
      config: {
        host: config.host,
        port: config.port,
        database: config.database,
        username: config.username,
        authSource: config.authSource,
        ssl: config.ssl
      },
      message: 'Database configuration found'
    })
  } catch (error) {
    console.error('Failed to get database configuration:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to get database configuration',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
