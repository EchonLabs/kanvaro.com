import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import '@/models/registry'
import { Project } from '@/models/Project'
import { ProjectIncome } from '@/models/ProjectIncome'
import { authenticateUser } from '@/lib/auth-utils'
import { Permission } from '@/lib/permissions/permission-definitions'
import { PermissionService } from '@/lib/permissions/permission-service'

type IncomingAttachment = {
  name?: unknown
  url?: unknown
  size?: unknown
  type?: unknown
  uploadedBy?: unknown
  uploadedAt?: unknown
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
    const userId = user.id

    const project = await Project.findById(params.id).select('organization')
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (project.organization?.toString() !== user.organization?.toString()) {
      return NextResponse.json({ error: 'Access denied to project' }, { status: 403 })
    }

    const hasProjectAccess = await PermissionService.canAccessProject(userId, params.id)
    if (!hasProjectAccess) {
      return NextResponse.json({ error: 'Insufficient access to project' }, { status: 403 })
    }

    const canViewIncome = await PermissionService.hasPermission(userId, Permission.FINANCIAL_VIEW_INCOME, params.id)
    if (!canViewIncome) {
      return NextResponse.json({ error: 'Insufficient permissions to view income' }, { status: 403 })
    }

    const incomes = await ProjectIncome.find({ project: params.id })
      .populate('attachments.uploadedBy', 'firstName lastName email')
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
    const userId = user.id

    const project = await Project.findById(params.id).select('organization')
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (project.organization?.toString() !== user.organization?.toString()) {
      return NextResponse.json({ error: 'Access denied to project' }, { status: 403 })
    }

    const hasProjectAccess = await PermissionService.canAccessProject(userId, params.id)
    if (!hasProjectAccess) {
      return NextResponse.json({ error: 'Insufficient access to project' }, { status: 403 })
    }

    const canCreateIncome = await PermissionService.hasPermission(userId, Permission.FINANCIAL_CREATE_INCOME, params.id)
    if (!canCreateIncome) {
      return NextResponse.json({ error: 'Insufficient permissions to add income' }, { status: 403 })
    }

    const body = await request.json()
    const {
      invoiceNumber,
      category,
      subCategory,
      customSubCategory,
      description,
      utilizableBudget,
      approvedDate,
      actualStartDate,
      paidStatus,
      receivedBy,
      attachments
    } = body || {}

    if (!invoiceNumber || !category || !description || utilizableBudget === undefined || utilizableBudget === null || !approvedDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const normalizedCategory = typeof category === 'string' ? category.toLowerCase() : ''
    if (!['invoice', 'consulting', 'other'].includes(normalizedCategory)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }

    const normalizedSubCategory = typeof subCategory === 'string' ? subCategory.toLowerCase() : undefined
    if (normalizedCategory === 'invoice') {
      if (!normalizedSubCategory || !['amc', 'cr', 'other'].includes(normalizedSubCategory)) {
        return NextResponse.json({ error: 'Sub Category is required for Invoice category' }, { status: 400 })
      }
    }

    const normalizedCustomSubCategory = typeof customSubCategory === 'string'
      ? customSubCategory.trim()
      : ''

    if (normalizedCategory === 'invoice' && normalizedSubCategory === 'other' && !normalizedCustomSubCategory) {
      return NextResponse.json({ error: 'Custom sub category is required when Sub Category is Other' }, { status: 400 })
    }

    const numericBudget = Number(utilizableBudget)
    if (!Number.isFinite(numericBudget) || numericBudget < 0) {
      return NextResponse.json({ error: 'Utilizable Budget must be a non-negative number' }, { status: 400 })
    }

    const parsedApprovedDate = new Date(approvedDate)
    if (Number.isNaN(parsedApprovedDate.getTime())) {
      return NextResponse.json({ error: 'Approved Date is invalid' }, { status: 400 })
    }

    const parsedActualStartDate = actualStartDate ? new Date(actualStartDate) : undefined
    if (parsedActualStartDate && Number.isNaN(parsedActualStartDate.getTime())) {
      return NextResponse.json({ error: 'Actual Start Date is invalid' }, { status: 400 })
    }

    const processedAttachments = Array.isArray(attachments)
      ? attachments.map((att: IncomingAttachment) => {
        const name = typeof att?.name === 'string' ? att.name : undefined
        const url = typeof att?.url === 'string' ? att.url : undefined
        const type = typeof att?.type === 'string' ? att.type : undefined
        const size = typeof att?.size === 'number'
          ? att.size
          : (typeof att?.size === 'string' ? Number(att.size) : undefined)

        const uploadedBy = typeof att?.uploadedBy === 'string' && att.uploadedBy.trim() ? att.uploadedBy : user.id

        const uploadedAtRaw = att?.uploadedAt
        const uploadedAt = uploadedAtRaw
          ? new Date(uploadedAtRaw as string | number | Date)
          : new Date()

        return {
          name,
          url,
          size,
          type,
          uploadedBy,
          uploadedAt
        }
      })
      : []

    // Validate attachment fields if provided
    for (const att of processedAttachments) {
      if (!att.name || !att.url || !att.size || !att.type) {
        return NextResponse.json({ error: 'Invalid attachment data' }, { status: 400 })
      }
    }

    const normalizedPaidStatus = paidStatus === 'paid' ? 'paid' : 'unpaid'
    const normalizedReceivedBy = normalizedPaidStatus === 'paid' && typeof receivedBy === 'string' && receivedBy.trim()
      ? receivedBy.trim()
      : undefined

    if (normalizedPaidStatus === 'paid' && !normalizedReceivedBy) {
      return NextResponse.json({ error: 'Received By is required when status is Paid' }, { status: 400 })
    }

    const income = new ProjectIncome({
      project: params.id,
      organization: user.organization,
      invoiceNumber: String(invoiceNumber).trim(),
      category: normalizedCategory,
      subCategory: normalizedCategory === 'invoice' ? normalizedSubCategory : undefined,
      customSubCategory:
        normalizedCategory === 'invoice' && normalizedSubCategory === 'other'
          ? normalizedCustomSubCategory
          : undefined,
      description: String(description).trim(),
      utilizableBudget: numericBudget,
      approvedDate: parsedApprovedDate,
      actualStartDate: parsedActualStartDate,
      paidStatus: normalizedPaidStatus,
      receivedBy: normalizedReceivedBy,
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

export async function PUT(
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
    const userId = user.id

    const project = await Project.findById(params.id).select('organization')
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (project.organization?.toString() !== user.organization?.toString()) {
      return NextResponse.json({ error: 'Access denied to project' }, { status: 403 })
    }

    const hasProjectAccess = await PermissionService.canAccessProject(userId, params.id)
    if (!hasProjectAccess) {
      return NextResponse.json({ error: 'Insufficient access to project' }, { status: 403 })
    }

    // Reuse create permission for edit until a dedicated update permission exists
    const canEditIncome = await PermissionService.hasPermission(userId, Permission.FINANCIAL_CREATE_INCOME, params.id)
    if (!canEditIncome) {
      return NextResponse.json({ error: 'Insufficient permissions to edit income' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const {
      incomeId,
      invoiceNumber,
      category,
      subCategory,
      customSubCategory,
      description,
      utilizableBudget,
      approvedDate,
      actualStartDate,
      paidStatus,
      receivedBy,
      attachments
    } = body || {}

    if (!incomeId) {
      return NextResponse.json({ error: 'Income ID is required' }, { status: 400 })
    }

    if (!invoiceNumber || !category || !description || utilizableBudget === undefined || utilizableBudget === null || !approvedDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const normalizedCategory = typeof category === 'string' ? category.toLowerCase() : ''
    if (!['invoice', 'consulting', 'other'].includes(normalizedCategory)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }

    const normalizedSubCategory = typeof subCategory === 'string' ? subCategory.toLowerCase() : undefined
    if (normalizedCategory === 'invoice') {
      if (!normalizedSubCategory || !['amc', 'cr', 'other'].includes(normalizedSubCategory)) {
        return NextResponse.json({ error: 'Sub Category is required for Invoice category' }, { status: 400 })
      }
    }

    const normalizedCustomSubCategory = typeof customSubCategory === 'string'
      ? customSubCategory.trim()
      : ''

    if (normalizedCategory === 'invoice' && normalizedSubCategory === 'other' && !normalizedCustomSubCategory) {
      return NextResponse.json({ error: 'Custom sub category is required when Sub Category is Other' }, { status: 400 })
    }

    const numericBudget = Number(utilizableBudget)
    if (!Number.isFinite(numericBudget) || numericBudget < 0) {
      return NextResponse.json({ error: 'Utilizable Budget must be a non-negative number' }, { status: 400 })
    }

    const parsedApprovedDate = new Date(approvedDate)
    if (Number.isNaN(parsedApprovedDate.getTime())) {
      return NextResponse.json({ error: 'Approved Date is invalid' }, { status: 400 })
    }

    const parsedActualStartDate = actualStartDate ? new Date(actualStartDate) : undefined
    if (parsedActualStartDate && Number.isNaN(parsedActualStartDate.getTime())) {
      return NextResponse.json({ error: 'Actual Start Date is invalid' }, { status: 400 })
    }

    const processedAttachments = Array.isArray(attachments)
      ? attachments.map((att: IncomingAttachment) => {
        const name = typeof att?.name === 'string' ? att.name : undefined
        const url = typeof att?.url === 'string' ? att.url : undefined
        const type = typeof att?.type === 'string' ? att.type : undefined
        const size = typeof att?.size === 'number'
          ? att.size
          : (typeof att?.size === 'string' ? Number(att.size) : undefined)

        const uploadedBy = typeof att?.uploadedBy === 'string' && att.uploadedBy.trim() ? att.uploadedBy : user.id

        const uploadedAtRaw = att?.uploadedAt
        const uploadedAt = uploadedAtRaw
          ? new Date(uploadedAtRaw as string | number | Date)
          : new Date()

        return {
          name,
          url,
          size,
          type,
          uploadedBy,
          uploadedAt
        }
      })
      : []

    for (const att of processedAttachments) {
      if (!att.name || !att.url || !att.size || !att.type) {
        return NextResponse.json({ error: 'Invalid attachment data' }, { status: 400 })
      }
    }

    const income = await ProjectIncome.findOne({ _id: incomeId, project: params.id })
    if (!income) {
      return NextResponse.json({ error: 'Income not found' }, { status: 404 })
    }

    if (income.organization?.toString() !== user.organization?.toString()) {
      return NextResponse.json({ error: 'Access denied to income' }, { status: 403 })
    }

    const normalizedPaidStatus = paidStatus === 'paid' ? 'paid' : 'unpaid'
    const normalizedReceivedBy = normalizedPaidStatus === 'paid' && typeof receivedBy === 'string' && receivedBy.trim()
      ? receivedBy.trim()
      : undefined

    if (normalizedPaidStatus === 'paid' && !normalizedReceivedBy) {
      return NextResponse.json({ error: 'Received By is required when status is Paid' }, { status: 400 })
    }

    income.invoiceNumber = String(invoiceNumber).trim()
    income.category = normalizedCategory
    income.subCategory = normalizedCategory === 'invoice' ? normalizedSubCategory : undefined
    income.customSubCategory = normalizedCategory === 'invoice' && normalizedSubCategory === 'other'
      ? normalizedCustomSubCategory
      : undefined
    income.description = String(description).trim()
    income.utilizableBudget = numericBudget
    income.approvedDate = parsedApprovedDate
    income.actualStartDate = parsedActualStartDate
    income.paidStatus = normalizedPaidStatus
    income.receivedBy = normalizedReceivedBy
    income.attachments = processedAttachments

    await income.save()

    return NextResponse.json({ success: true, data: income })
  } catch (error) {
    console.error('Update project income error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { user } = authResult
    const userId = user.id

    const project = await Project.findById(params.id).select('organization')
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (project.organization?.toString() !== user.organization?.toString()) {
      return NextResponse.json({ error: 'Access denied to project' }, { status: 403 })
    }

    const hasProjectAccess = await PermissionService.canAccessProject(userId, params.id)
    if (!hasProjectAccess) {
      return NextResponse.json({ error: 'Insufficient access to project' }, { status: 403 })
    }

    const canDeleteIncome = await PermissionService.hasPermission(userId, Permission.FINANCIAL_CREATE_INCOME, params.id)
    if (!canDeleteIncome) {
      return NextResponse.json({ error: 'Insufficient permissions to delete income' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const incomeId = searchParams.get('incomeId')
    if (!incomeId) {
      return NextResponse.json({ error: 'Income ID is required' }, { status: 400 })
    }

    const income = await ProjectIncome.findOne({ _id: incomeId, project: params.id })
    if (!income) {
      return NextResponse.json({ error: 'Income not found' }, { status: 404 })
    }

    if (income.organization?.toString() !== user.organization?.toString()) {
      return NextResponse.json({ error: 'Access denied to income' }, { status: 403 })
    }

    await income.deleteOne()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete project income error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
