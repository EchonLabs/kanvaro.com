import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import connectDB from '@/lib/db-config'
import '@/models/registry'
import { Lesson } from '@/models/Lesson'
import { Project } from '@/models/Project'
import { User } from '@/models/User'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'

export async function GET(req: NextRequest) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')
    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      return NextResponse.json({ error: 'Valid projectId is required' }, { status: 400 })
    }

    const project = await Project.findOne({
      _id: projectId,
      organization: authResult.user.organization,
      is_deleted: { $ne: true }
    })
      .select('_id settings.taskCategories')
      .lean() as {
      _id: unknown
      settings?: { taskCategories?: Array<{ key?: string; title?: string }> }
    } | null
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const canAccess = await PermissionService.canAccessProject(authResult.user.id, projectId)
    if (!canAccess) {
      return NextResponse.json({ error: 'Access denied to project' }, { status: 403 })
    }

    const search = searchParams.get('search')?.trim() || ''
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.max(1, Math.min(100, Number.parseInt(searchParams.get('limit') || '10', 10)))

    const query: any = { project: projectId, organization: authResult.user.organization }

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
      const searchRegex = new RegExp(escapedSearch, 'i')

      const orConditions: any[] = [
        { context: searchRegex },
        { rootCause: searchRegex },
        { actionRecommendation: searchRegex },
        { impactLevel: searchRegex }
      ]

      // Match category by display title (instead of raw key)
      const taskCategories = project.settings?.taskCategories || []
      const matchingCategoryKeys = taskCategories
        .filter((c) => c?.title && searchRegex.test(c.title))
        .map((c) => c.key)
        .filter((key): key is string => Boolean(key))
      if (matchingCategoryKeys.length > 0) {
        orConditions.push({ category: { $in: matchingCategoryKeys } })
      }

      // Match lesson ID (e.g. "001", "01", "1", "#001")
      const cleanedId = search.replace(/^#/, '')
      if (/^\d+$/.test(cleanedId)) {
        const parsedLessonNumber = Number.parseInt(cleanedId, 10)
        if (parsedLessonNumber > 0) {
          orConditions.push({ lessonNumber: parsedLessonNumber })
        }
      }

      // Match author (modifiedBy user's firstName, lastName, full name, or email)
      const matchingUsers = await User.find({
        organization: authResult.user.organization,
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { email: searchRegex },
          {
            $expr: {
              $regexMatch: {
                input: {
                  $concat: [
                    { $ifNull: ['$firstName', ''] },
                    ' ',
                    { $ifNull: ['$lastName', ''] }
                  ]
                },
                regex: escapedSearch,
                options: 'i'
              }
            }
          }
        ]
      })
        .select('_id')
        .lean()

      if (matchingUsers.length > 0) {
        orConditions.push({ modifiedBy: { $in: matchingUsers.map((u) => u._id) } })
      }

      query.$or = orConditions
    }

    const skip = (page - 1) * limit

    const [lessons, total] = await Promise.all([
      Lesson.find(query)
        .populate('modifiedBy', 'firstName lastName email avatar role')
        .sort({ lessonNumber: 1, createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Lesson.countDocuments(query)
    ])

    return NextResponse.json({
      lessons,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    })
  } catch (error) {
    console.error('Error fetching lessons:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const body = await req.json()
    const { projectId, category, impactLevel, context, rootCause, actionRecommendation } = body

    if (!projectId || !category?.trim() || !context?.trim() || !actionRecommendation?.trim()) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
    }

    const project = await Project.findOne({
      _id: projectId,
      organization: authResult.user.organization,
      is_deleted: { $ne: true }
    })
      .select('_id settings.taskCategories')
      .lean() as {
      _id: unknown
      settings?: { taskCategories?: Array<{ key?: string }> }
    } | null
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const taskCategories = project.settings?.taskCategories || []
    if (taskCategories.length > 0 && !taskCategories.some((c) => c.key === category.trim())) {
      return NextResponse.json({ error: 'Select a valid task category for this project' }, { status: 400 })
    }

    const canManage = await PermissionService.hasPermission(
      authResult.user.id,
      Permission.PROJECT_UPDATE,
      projectId
    )
    if (!canManage) {
      return NextResponse.json(
        { error: 'Only project managers and admins can create lessons' },
        { status: 403 }
      )
    }

    // Determine sequential lessonNumber for this project
    const latestLesson = await Lesson.findOne({ project: projectId }).sort({ lessonNumber: -1 }).select('lessonNumber').lean() as any
    const nextNumber = latestLesson?.lessonNumber ? latestLesson.lessonNumber + 1 : 1

    const lesson = await Lesson.create({
      project: projectId,
      organization: authResult.user.organization,
      lessonNumber: nextNumber,
      category,
      impactLevel: impactLevel || 'medium',
      context,
      rootCause,
      actionRecommendation,
      modifiedBy: authResult.user.id
    })

    await lesson.populate('modifiedBy', 'firstName lastName email avatar role')

    return NextResponse.json({ lesson }, { status: 201 })
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Error creating lesson:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
