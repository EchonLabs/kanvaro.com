import { NextResponse } from 'next/server'
import { getPublicJwks } from '@/lib/oauth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const jwks = getPublicJwks()
    return NextResponse.json(jwks, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=300',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'temporarily_unavailable' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          Pragma: 'no-cache',
        },
      }
    )
  }
}
