import { NextResponse } from 'next/server'
import { clearConfig } from '@/lib/config'

export async function POST() {
  try {
    await clearConfig()
    
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
