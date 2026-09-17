import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Project } from '@/models/Project'
import { Task } from '@/models/Task'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'

type TaskCategory = { key: string; title: string; order: number }

const normalizeTitle = (value: unknown) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''

const categoriesFor = (project: any): TaskCategory[] =>
  Array.isArray(project.settings?.taskCategories)
    ? project.settings.taskCategories.sort((a: TaskCategory, b: TaskCategory) => a.order - b.order)
    : []

async function getProjectAndAuthorize(projectId: string) {
  const authResult = await authenticateUser()
  if ('error' in authResult) return { error: NextResponse.json({ error: authResult.error }, { status: authResult.status }) }

  const { user } = authResult
  const project = await Project.findOne({ _id: projectId, organization: user.organization, is_deleted: { $ne: true } })
  if (!project) return { error: NextResponse.json({ error: 'Project not found' }, { status: 404 }) }

  return { user, project }
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB()
    const result = await getProjectAndAuthorize(params.id)
    if ('error' in result) return result.error

    const canViewAll = await PermissionService.hasPermission(result.user.id, Permission.PROJECT_VIEW_ALL)
    const userId = result.user.id.toString()
    const canAccess = canViewAll ||
      result.project.createdBy?.toString() === userId ||
      result.project.teamMembers?.some((member: any) => member.memberId?.toString() === userId) ||
      result.project.projectRoles?.some((role: any) => role.user?.toString() === userId)
    if (!canAccess) return NextResponse.json({ error: 'Access denied to project' }, { status: 403 })

    return NextResponse.json({ success: true, data: categoriesFor(result.project) })
  } catch (error) {
    console.error('Get task categories error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB()
    const result = await getProjectAndAuthorize(params.id)
    if ('error' in result) return result.error
    const { user, project } = result

    if (!await PermissionService.hasPermission(user.id, Permission.PROJECT_UPDATE, params.id)) {
      return NextResponse.json({ error: 'Only project managers and admins can manage task categories' }, { status: 403 })
    }

    const title = normalizeTitle((await request.json()).title)
    if (!title || title.length > 50) return NextResponse.json({ error: 'Category name must be between 1 and 50 characters' }, { status: 400 })

    const categories = categoriesFor(project)
    if (categories.some(category => category.title.toLocaleLowerCase() === title.toLocaleLowerCase())) {
      return NextResponse.json({ error: 'A category with this name already exists' }, { status: 409 })
    }

    const baseKey = title.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'category'
    let key = baseKey
    let suffix = 2
    while (categories.some(category => category.key === key)) key = `${baseKey}-${suffix++}`

    const category = { key, title, order: categories.length }
    project.set('settings.taskCategories', [...categories, category])
    await project.save()
    return NextResponse.json({ success: true, data: category }, { status: 201 })
  } catch (error) {
    console.error('Create task category error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB()
    const result = await getProjectAndAuthorize(params.id)
    if ('error' in result) return result.error
    const { user, project } = result

    if (!await PermissionService.hasPermission(user.id, Permission.PROJECT_UPDATE, params.id)) {
      return NextResponse.json({ error: 'Only project managers and admins can manage task categories' }, { status: 403 })
    }

    const { key, title: rawTitle } = await request.json()
    const title = normalizeTitle(rawTitle)
    const categories = categoriesFor(project)
    const category = categories.find(item => item.key === key)
    if (!category) return NextResponse.json({ error: 'Task category not found' }, { status: 404 })
    if (!title || title.length > 50) return NextResponse.json({ error: 'Category name must be between 1 and 50 characters' }, { status: 400 })
    if (categories.some(item => item.key !== key && item.title.toLocaleLowerCase() === title.toLocaleLowerCase())) {
      return NextResponse.json({ error: 'A category with this name already exists' }, { status: 409 })
    }

    category.title = title
    project.set('settings.taskCategories', categories)
    await project.save()

    return NextResponse.json({ success: true, data: category })
  } catch (error) {
    console.error('Rename task category error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB()
    const result = await getProjectAndAuthorize(params.id)
    if ('error' in result) return result.error
    const { user, project } = result

    if (!await PermissionService.hasPermission(user.id, Permission.PROJECT_UPDATE, params.id)) {
      return NextResponse.json({ error: 'Only project managers and admins can manage task categories' }, { status: 403 })
    }

    const { key, action, targetKey } = await request.json()
    const categories = categoriesFor(project)
    const category = categories.find(item => item.key === key)
    if (!category) return NextResponse.json({ error: 'Task category not found' }, { status: 404 })
    if (!['unassign', 'migrate'].includes(action)) return NextResponse.json({ error: "action must be 'unassign' or 'migrate'" }, { status: 400 })

    const target = action === 'migrate' ? categories.find(item => item.key === targetKey && item.key !== key) : undefined
    if (action === 'migrate' && !target) return NextResponse.json({ error: 'A different destination category is required' }, { status: 400 })

    const remaining = categories.filter(item => item.key !== key).map((item, order) => ({ ...item, order }))
    project.set('settings.taskCategories', remaining)
    const taskUpdate = action === 'migrate' ? { $set: { category: target!.key } } : { $unset: { category: 1 } }
    const [, taskResult] = await Promise.all([
      project.save(),
      Task.updateMany({ project: project._id, organization: user.organization, category: key }, taskUpdate)
    ])

    return NextResponse.json({ success: true, affectedTasks: taskResult.modifiedCount })
  } catch (error) {
    console.error('Delete task category error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
