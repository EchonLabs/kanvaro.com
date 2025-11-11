import { NextResponse } from 'next/server'
import { loadConfig, isSetupCompleted } from '@/lib/config'
import fs from 'fs'
import path from 'path'

export async function GET() {
  try {
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
      config: config
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
