import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import '@/models/registry'
import { Project } from '@/models/Project'
import { ProjectIncome } from '@/models/ProjectIncome'
import { authenticateUser } from '@/lib/auth-utils'

function isAdminRole(role: unknown) {
  if (typeof role !== 'string') return false
  return ['admin', 'super_admin', 'superadmin'].includes(role.toLowerCase())
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { user } = authResult
    if (!isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Access denied. Admin only.' }, { status: 403 })
    }

    const project = await Project.findById(params.id).select('organization')
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (project.organization?.toString() !== user.organization?.toString()) {
      return NextResponse.json({ error: 'Access denied to project' }, { status: 403 })
    }

    const incomes = await ProjectIncome.find({ project: params.id })
      .sort({ createdAt: -1 })

    return NextResponse.json({ success: true, data: incomes })
  } catch (error) {
    console.error('Get project income error:', error)
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
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { user } = authResult
    if (!isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Access denied. Admin only.' }, { status: 403 })
    }

    const project = await Project.findById(params.id).select('organization')
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (project.organization?.toString() !== user.organization?.toString()) {
      return NextResponse.json({ error: 'Access denied to project' }, { status: 403 })
    }

    const body = await request.json()
    const {
      invoiceNumber,
      category,
      subCategory,
      description,
      utilizableBudget,
      approvedDate,
      actualStartDate,
      attachments
    } = body || {}

    if (!invoiceNumber || !category || !description || utilizableBudget === undefined || utilizableBudget === null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const normalizedCategory = typeof category === 'string' ? category.toLowerCase() : ''
    if (!['invoice', 'consulting', 'other'].includes(normalizedCategory)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }

    const normalizedSubCategory = typeof subCategory === 'string' ? subCategory.toLowerCase() : undefined
    if (normalizedCategory === 'invoice') {
      if (!normalizedSubCategory || !['amc', 'cr'].includes(normalizedSubCategory)) {
        return NextResponse.json({ error: 'Sub Category is required for Invoice category' }, { status: 400 })
      }
    }

    const numericBudget = Number(utilizableBudget)
    if (!Number.isFinite(numericBudget) || numericBudget < 0) {
      return NextResponse.json({ error: 'Utilizable Budget must be a non-negative number' }, { status: 400 })
    }

    const processedAttachments = Array.isArray(attachments)
      ? attachments.map((att: any) => ({
        name: att?.name,
        url: att?.url,
        size: att?.size,
        type: att?.type,
        uploadedBy: att?.uploadedBy || user.id,
        uploadedAt: att?.uploadedAt ? new Date(att.uploadedAt) : new Date()
      }))
      : []

    // Validate attachment fields if provided
    for (const att of processedAttachments) {
      if (!att.name || !att.url || !att.size || !att.type) {
        return NextResponse.json({ error: 'Invalid attachment data' }, { status: 400 })
      }
    }

    const income = new ProjectIncome({
      project: params.id,
      organization: user.organization,
      invoiceNumber: String(invoiceNumber).trim(),
      category: normalizedCategory,
      subCategory: normalizedCategory === 'invoice' ? normalizedSubCategory : undefined,
      description: String(description).trim(),
      utilizableBudget: numericBudget,
      approvedDate: approvedDate ? new Date(approvedDate) : undefined,
      actualStartDate: actualStartDate ? new Date(actualStartDate) : undefined,
      attachments: processedAttachments,
      addedBy: user.id
    })

    await income.save()

    return NextResponse.json({ success: true, data: income }, { status: 201 })
  } catch (error) {
    console.error('Create project income error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
