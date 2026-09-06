/**
 * HTTP driver for one stand-up background job.
 *
 * Self-hosted installs do not need this — the in-process ticker covers every
 * job (plan CRON-3). It exists for Vercel, whose serverless runtime has no
 * long-lived process to tick, and for manual ops triggering.
 *
 * Deliberately thin: every decision lives in `handleCronJobRequest`, which is
 * unit tested. This file only bridges Next's Request/Response to it.
 */
import { NextResponse } from 'next/server'

import connectDB from '@/lib/db-config'
import { handleCronJobRequest } from '@/lib/standup/jobs/http'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: { job: string } }
): Promise<NextResponse> {
  await connectDB()

  const { status, body } = await handleCronJobRequest(request.headers, params.job)

  return NextResponse.json(body, { status })
}
