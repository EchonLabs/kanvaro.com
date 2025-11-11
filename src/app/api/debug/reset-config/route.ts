import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function POST() {
  try {
    const configDir = path.join(process.cwd(), 'config')
    const configFile = path.join(configDir, 'config.json')
    
    // Delete the config file if it exists
    if (fs.existsSync(configFile)) {
      fs.unlinkSync(configFile)
      console.log('Config file deleted')
    }

    // Remove the directory if it's now empty
    if (fs.existsSync(configDir)) {
      const remainingFiles = fs.readdirSync(configDir)
      if (remainingFiles.length === 0) {
        fs.rmdirSync(configDir)
      }
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
