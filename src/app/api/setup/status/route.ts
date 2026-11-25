import { NextResponse } from 'next/server'
import { getSetupState } from '@/lib/setup-guard'

export async function GET() {
  try {
    const { setupCompleted, hasConfig, hasUsers, organizationId } = await getSetupState()

    return NextResponse.json({
      setupCompleted,
      hasConfig,
      hasUsers,
      organizationId,
      message: setupCompleted
        ? 'Application is configured and ready'
        : 'Application setup is required'
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
