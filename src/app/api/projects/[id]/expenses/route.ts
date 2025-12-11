import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Expense } from '@/models/Expense'
import { Project } from '@/models/Project'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'
import { Organization } from '@/models/Organization'

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

    // Check if user can access this project
    const canAccessProject = await PermissionService.canAccessProject(user.id, projectId)
    if (!canAccessProject) {
      return NextResponse.json(
        { error: 'Access denied to project' },
        { status: 403 }
      )
    }

    // Find project to check expense tracking setting
    const project = await Project.findById(projectId)
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    if (!project.settings.allowExpenseTracking) {
      return NextResponse.json(
        { error: 'Expense tracking is not enabled for this project' },
        { status: 403 }
      )
    }

    // Get organization currency
    const organization = await Organization.findById(user.organization)
    const orgCurrency = organization?.currency || 'USD'

    // Fetch expenses for this project
    const expenses = await Expense.find({ project: projectId })
      .populate('addedBy', 'firstName lastName email')
      .populate('paidBy', 'firstName lastName email')
      .sort({ expenseDate: -1 })

    return NextResponse.json({
      success: true,
      data: expenses,
      currency: orgCurrency
    })

  } catch (error) {
    console.error('Get expenses error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
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

    // Check if user can access this project
    const canAccessProject = await PermissionService.canAccessProject(user.id, projectId)
    if (!canAccessProject) {
      return NextResponse.json(
        { error: 'Access denied to project' },
        { status: 403 }
      )
    }

    // Find project to check expense tracking setting
    const project = await Project.findById(projectId)
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    if (!project.settings.allowExpenseTracking) {
      return NextResponse.json(
        { error: 'Expense tracking is not enabled for this project' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      name,
      description,
      unitPrice,
      quantity,
      fullAmount,
      expenseDate,
      category,
      isBillable,
      paidStatus,
      paidBy,
      attachments
    } = body

    // Validate required fields
    if (!name || !unitPrice || !quantity || !fullAmount || !expenseDate || !category) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Process attachments
    const processedAttachments = (attachments || []).map((att: any) => ({
      name: att.name,
      url: att.url,
      size: att.size,
      type: att.type,
      uploadedBy: att.uploadedBy || user.id,
      uploadedAt: att.uploadedAt ? new Date(att.uploadedAt) : new Date()
    }))

    // Create expense
    const expense = new Expense({
      project: projectId,
      name,
      description,
      unitPrice,
      quantity,
      fullAmount,
      expenseDate: new Date(expenseDate),
      category,
      isBillable: isBillable || false,
      paidStatus: paidStatus || 'unpaid',
      paidBy: paidStatus === 'paid' && paidBy ? paidBy : undefined,
      attachments: processedAttachments,
      addedBy: user.id
    })

    await expense.save()

    // Update project budget spent amount
    if (project.budget) {
      project.budget.spent = (project.budget.spent || 0) + fullAmount
      
      // Map expense categories to budget categories
      // Expense categories: labor, materials, overhead, external, other
      // Budget categories: materials, overhead, external
      const budgetCategoryMap: Record<string, 'materials' | 'overhead' | 'external'> = {
        'labor': 'materials', // Map labor to materials
        'materials': 'materials',
        'overhead': 'overhead',
        'external': 'external',
        'other': 'materials' // Map other to materials
      }
      
      const budgetCategory = budgetCategoryMap[category] || 'materials'
      const currentAmount = (project.budget.categories as any)[budgetCategory] || 0
      ;(project.budget.categories as any)[budgetCategory] = currentAmount + fullAmount
      
      project.budget.lastUpdated = new Date()
      project.budget.updatedBy = user.id
      await project.save()
    }

    // Populate and return
    const populatedExpense = await Expense.findById(expense._id)
      .populate('addedBy', 'firstName lastName email')
      .populate('paidBy', 'firstName lastName email')

    return NextResponse.json({
      success: true,
      data: populatedExpense
    }, { status: 201 })

  } catch (error) {
    console.error('Create expense error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

