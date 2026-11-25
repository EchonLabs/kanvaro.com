import { NextResponse } from 'next/server'
import { rejectUnlessDevAdmin } from '@/lib/debug-guard'
import { loadConfig, isSetupCompleted } from '@/lib/config'
import fs from 'fs'
import path from 'path'

export async function GET() {
  try {
    const denied = await rejectUnlessDevAdmin()
    if (denied) return denied

    const configFile = path.join(process.cwd(), 'config.json')
    const configFileExists = fs.existsSync(configFile)
    
    const config = loadConfig()
    const setupCompleted = isSetupCompleted()
    
    return NextResponse.json({
      success: true,
      configFileExists,
      configFile: configFile,
      setupCompleted,
      hasDatabaseConfig: !!config.database,
      organizationId: config.organizationId,
      config: {
        ...config,
        database: config.database
          ? { ...config.database, password: config.database.password ? '[redacted]' : '', uri: '[redacted]' }
          : undefined,
        env: config.env
          ? Object.fromEntries(Object.keys(config.env).map((k) => [k, '[redacted]']))
          : undefined
      }
    })
  } catch (error) {
    console.error('Failed to check config file:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to check config file',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
