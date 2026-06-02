import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import '@/models/registry'
import { StandupCronJob } from '@/models/StandupCronJob'
import { Project } from '@/models/Project'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { getStandupQueue, toCronExpression, jobRepeatKey } from '@/lib/queue/standupQueue'
import type { CronFrequency, CronJobType } from '@/models/StandupCronJob'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    if ('error' in authResult) return NextResponse.json({ error: authResult.error }, { status: authResult.status })

    const canAccess = await PermissionService.canAccessProject(authResult.user.id, params.id)
    if (!canAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    const jobs = await StandupCronJob.find({
      projectId: params.id,
      organizationId: authResult.user.organization
    }).lean()

    return NextResponse.json({ success: true, data: jobs })
  } catch (error) {
    console.error('Get cron schedules error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    if ('error' in authResult) return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    const { user } = authResult

    const project = await Project.findById(params.id).select('organization').lean() as any
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (project.organization?.toString() !== user.organization?.toString()) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json()
    const { jobType, enabled, frequency, timeHHMM, timezone = 'UTC' } = body as {
      jobType: CronJobType
      enabled: boolean
      frequency: CronFrequency
      timeHHMM: string
      timezone?: string
    }

    if (!jobType || !['ai_tracker', 'summary_generator'].includes(jobType)) {
      return NextResponse.json({ error: 'Invalid jobType' }, { status: 400 })
    }
    if (!frequency || !['daily', 'weekdays', 'weekly'].includes(frequency)) {
      return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 })
    }
    if (!timeHHMM || !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeHHMM)) {
      return NextResponse.json({ error: 'Invalid time format (HH:MM)' }, { status: 400 })
    }

    const queue = getStandupQueue()
    const repeatKey = jobRepeatKey(params.id, jobType)
    const cronExpression = toCronExpression(frequency, timeHHMM)

    // Remove any existing repeatable job for this project+type
    const existingRepeatableJobs = await queue.getRepeatableJobs()
    for (const rj of existingRepeatableJobs) {
      if (rj.key.includes(repeatKey)) {
        await queue.removeRepeatableByKey(rj.key)
      }
    }

    let bullJobKey: string | undefined

    if (enabled) {
      await queue.add(
        { jobType, projectId: params.id, organizationId: user.organization, createdBy: user.id },
        {
          repeat: { cron: cronExpression },
          jobId: repeatKey,
          removeOnComplete: 50,
          removeOnFail: 20
        }
      )
      bullJobKey = repeatKey
    }

    const savedJob = await StandupCronJob.findOneAndUpdate(
      { projectId: params.id, organizationId: user.organization, jobType },
      { enabled, frequency, timeHHMM, timezone, bullJobKey, createdBy: user.id },
      { new: true, upsert: true }
    )

    return NextResponse.json({ success: true, data: savedJob })
  } catch (error: any) {
    console.error('Save cron schedule error:', error)
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}
