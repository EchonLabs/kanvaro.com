import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db-config'
import { TaskTemplate } from '@/models/TaskTemplate'
import '@/models/User' // Ensure User model is registered for populate('createdBy')
import { authenticateUser } from '@/lib/auth-utils'

export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { searchParams } = new URL(req.url)
    const organizationId = searchParams.get('organizationId')
    const category = searchParams.get('category')
    const isPublic = searchParams.get('isPublic')
    const search = searchParams.get('search')

    if (!organizationId) {
      return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
    }

    await connectDB()

    const query: any = {
      $or: [
        { organization: organizationId },
        { isPublic: true }
      ]
    }

    if (category) {
      query.category = category
    }

    if (isPublic !== null) {
      query.isPublic = isPublic === 'true'
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ]
    }

    const templates = await TaskTemplate.find(query)
      .populate('createdBy', 'name email')
      .sort({ usageCount: -1, createdAt: -1 })

    return NextResponse.json(templates)
  } catch (error) {
    console.error('Get task templates error:', error)
    return NextResponse.json({ error: 'Failed to get templates' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const body = await req.json()
    const { name, description, organizationId, isPublic, category, tags, template } = body

    if (!name || !organizationId || !category || !template) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    await connectDB()

    const taskTemplate = new TaskTemplate({
      name,
      description,
      organization: organizationId,
      createdBy: authResult.user.id,
      isPublic: isPublic || false,
      category,
      tags: tags || [],
      template
    })

    await taskTemplate.save()

    return NextResponse.json(taskTemplate)
  } catch (error) {
    console.error('Create task template error:', error)
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  }
}
