import { NextResponse } from 'next/server'
import { rejectUnlessDevAdmin } from '@/lib/debug-guard'
import fs from 'fs'
import path from 'path'

export async function POST() {
  try {
    const denied = await rejectUnlessDevAdmin()
    if (denied) return denied

    const configFile = path.join(process.cwd(), 'config.json')
    
    // Delete the config file if it exists
    if (fs.existsSync(configFile)) {
      fs.unlinkSync(configFile)
      console.log('Config file deleted')
    }
    
    return NextResponse.json({
      success: true,
      message: 'Configuration reset successfully. Please complete the setup process.'
    })
  } catch (error) {
    console.error('Failed to reset config:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to reset configuration',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
