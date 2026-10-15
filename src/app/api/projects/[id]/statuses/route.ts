import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import connectDB from '@/lib/db-config'
import { Project } from '@/models/Project'
import { Task } from '@/models/Task'
import { authenticateUser } from '@/lib/auth-utils'
import { logActivity } from '@/lib/activity-logger'
import {
  DEFAULT_TASK_STATUS_KEYS,
  DEFAULT_TASK_STATUS_LABELS,
  DEFAULT_TASK_STATUS_BADGE_MAP
} from '@/constants/taskStatuses'
import { formatToTitleCase } from '@/lib/utils'

const CUSTOM_STATUS_COLORS = [
  'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
  'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200'
]

function slugifyStatusKey(title: string): string {
  let key = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  if (!key || /^[0-9]/.test(key)) {
    key = `status_${key || Date.now()}`
  }
  return key
}

function getDefaultStatuses() {
  return DEFAULT_TASK_STATUS_KEYS.map((k, index) => ({
    key: k,
    title: DEFAULT_TASK_STATUS_LABELS[k] || k,
    color: DEFAULT_TASK_STATUS_BADGE_MAP[k],
    order: index
  }))
}

function normalizeStatuses(rawStatuses?: any[]): Array<{ key: string; title: string; color?: string; order: number }> {
  if (!Array.isArray(rawStatuses) || rawStatuses.length === 0) {
    return getDefaultStatuses()
  }

  const mapped = rawStatuses.map((s, idx) => {
    const raw = typeof s.toObject === 'function' ? s.toObject() : (s._doc || s)
    const key = raw.key || s.key || (DEFAULT_TASK_STATUS_KEYS[idx] ?? `status_${idx}`)
    const title = raw.title || s.title || DEFAULT_TASK_STATUS_LABELS[key] || formatToTitleCase(key)
    const color = raw.color || s.color || DEFAULT_TASK_STATUS_BADGE_MAP[key] || 'bg-blue-100 text-blue-800'
    return {
      key,
      title,
      color,
      order: typeof raw.order === 'number' ? raw.order : idx
    }
  }).filter(s => Boolean(s.key && s.title))

  return mapped.length > 0 ? mapped : getDefaultStatuses()
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { user } = authResult
    const projectId = params.id

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
    }

    const project = await Project.findOne({
      _id: projectId,
      organization: user.organization,
      is_deleted: { $ne: true }
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const statuses = normalizeStatuses(project.settings?.kanbanStatuses)

    return NextResponse.json({
      success: true,
      data: statuses
    })
  } catch (error) {
    console.error('Failed to get project statuses:', error)
    return NextResponse.json(
      { error: 'Internal server error while fetching project statuses' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { user } = authResult
    const projectId = params.id

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
    }

    const project = await Project.findOne({
      _id: projectId,
      organization: user.organization,
      is_deleted: { $ne: true }
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const { title, color, key: customKey } = body

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json(
        { error: 'Status name is required' },
        { status: 400 }
      )
    }

    const trimmedTitle = title.trim()
    if (trimmedTitle.length > 50) {
      return NextResponse.json(
        { error: 'Status name must be 50 characters or less' },
        { status: 400 }
      )
    }

    const generatedKey = customKey?.trim() ? slugifyStatusKey(customKey) : slugifyStatusKey(trimmedTitle)

    // Retrieve or initialize current statuses for this project
    let currentStatuses = normalizeStatuses(project.settings?.kanbanStatuses)

    // Check for duplicates (case-insensitive name or key)
    const duplicate = currentStatuses.find(
      s =>
        s.title.toLowerCase() === trimmedTitle.toLowerCase() ||
        s.key.toLowerCase() === generatedKey.toLowerCase()
    )

    if (duplicate) {
      return NextResponse.json(
        { error: `A status named "${duplicate.title}" already exists in this project.` },
        { status: 409 }
      )
    }

    // Determine color
    const assignedColor =
      color ||
      CUSTOM_STATUS_COLORS[currentStatuses.length % CUSTOM_STATUS_COLORS.length]

    const newStatus = {
      key: generatedKey,
      title: trimmedTitle,
      color: assignedColor,
      order: currentStatuses.length
    }

    currentStatuses.push(newStatus)

    // Save to this project only
    if (!project.settings) {
      project.settings = {} as any
    }
    project.settings.kanbanStatuses = currentStatuses
    project.markModified('settings')
    await project.save()

    // Log activity
    logActivity({
      organizationId: user.organization.toString(),
      userId: user.id.toString(),
      action: 'project_updated',
      entityType: 'project',
      entityId: project._id.toString(),
      entityName: project.name,
      projectId: project._id.toString(),
      projectName: project.name,
      details: { statusKey: generatedKey, statusTitle: trimmedTitle }
    }).catch(err => console.error('Failed to log status creation activity:', err))

    return NextResponse.json({
      success: true,
      message: 'Status added successfully',
      data: newStatus,
      statuses: currentStatuses
    })
  } catch (error) {
    console.error('Failed to add custom status:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error while adding status' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { user } = authResult
    const projectId = params.id

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    let statusKey = searchParams.get('key')

    if (!statusKey) {
      const body = await request.json().catch(() => ({}))
      statusKey = body.key
    }

    if (!statusKey || typeof statusKey !== 'string') {
      return NextResponse.json(
        { error: 'Status key is required' },
        { status: 400 }
      )
    }

    if (DEFAULT_TASK_STATUS_KEYS.includes(statusKey as any)) {
      return NextResponse.json(
        { error: 'Default system statuses cannot be removed' },
        { status: 400 }
      )
    }

    const project = await Project.findOne({
      _id: projectId,
      organization: user.organization,
      is_deleted: { $ne: true }
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const currentStatuses = normalizeStatuses(project.settings?.kanbanStatuses)
    const statusIndex = currentStatuses.findIndex((s: any) => s.key === statusKey)

    if (statusIndex === -1) {
      return NextResponse.json(
        { error: 'Custom status not found in this project' },
        { status: 404 }
      )
    }

    const deletedStatus = currentStatuses[statusIndex]
    const updatedStatuses = currentStatuses
      .filter((s: any) => s.key !== statusKey)
      .map((s: any, idx: number) => ({
        key: s.key,
        title: s.title || DEFAULT_TASK_STATUS_LABELS[s.key] || formatToTitleCase(s.key),
        color: s.color || DEFAULT_TASK_STATUS_BADGE_MAP[s.key] || 'bg-blue-100 text-blue-800',
        order: idx
      }))

    if (!project.settings) {
      project.settings = {} as any
    }
    project.settings.kanbanStatuses = updatedStatuses
    project.markModified('settings')
    await project.save()

    // Move any tasks that were using this deleted custom status to 'todo'
    await Task.updateMany(
      { project: project._id, status: statusKey },
      { $set: { status: 'todo' } }
    )

    logActivity({
      organizationId: user.organization.toString(),
      userId: user.id.toString(),
      action: 'project_updated',
      entityType: 'project',
      entityId: project._id.toString(),
      entityName: project.name,
      projectId: project._id.toString(),
      projectName: project.name,
      details: { deletedStatusKey: statusKey, deletedStatusTitle: deletedStatus.title }
    }).catch(err => console.error('Failed to log status deletion activity:', err))

    return NextResponse.json({
      success: true,
      message: `Status "${deletedStatus.title || statusKey}" deleted successfully`,
      statuses: updatedStatuses
    })
  } catch (error) {
    console.error('Failed to delete custom status:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error while deleting status' },
      { status: 500 }
    )
  }
}

