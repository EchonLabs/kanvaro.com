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

export async function PUT(
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

    const body = await request.json()
    const {
      expenseId,
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

    if (!expenseId) {
      return NextResponse.json(
        { error: 'Expense ID is required' },
        { status: 400 }
      )
    }

    // Find and validate expense belongs to this project
    const expense = await Expense.findOne({ _id: expenseId, project: projectId })
    if (!expense) {
      return NextResponse.json(
        { error: 'Expense not found or access denied' },
        { status: 404 }
      )
    }

    // Get the old amount for budget adjustment
    const oldFullAmount = expense.fullAmount
    const oldCategory = expense.category

    // Update expense fields
    if (name !== undefined) expense.name = name
    if (description !== undefined) expense.description = description
    if (unitPrice !== undefined) expense.unitPrice = unitPrice
    if (quantity !== undefined) expense.quantity = quantity
    if (fullAmount !== undefined) expense.fullAmount = fullAmount
    if (expenseDate !== undefined) expense.expenseDate = new Date(expenseDate)
    if (category !== undefined) expense.category = category
    if (isBillable !== undefined) expense.isBillable = isBillable
    if (paidStatus !== undefined) expense.paidStatus = paidStatus
    if (paidBy !== undefined || paidStatus === 'unpaid') {
      expense.paidBy = paidStatus === 'paid' && paidBy ? paidBy : undefined
    }

    // Process attachments if provided
    if (attachments !== undefined) {
      const processedAttachments = attachments.map((att: any) => ({
        name: att.name,
        url: att.url,
        size: att.size,
        type: att.type,
        uploadedBy: att.uploadedBy || user.id,
        uploadedAt: att.uploadedAt ? new Date(att.uploadedAt) : new Date()
      }))
      expense.attachments = processedAttachments
    }

    await expense.save()

    // Update project budget if amount or category changed
    if (oldFullAmount !== fullAmount || oldCategory !== category) {
      const project = await Project.findById(projectId)
      if (project?.budget) {
        // Subtract old amount from old category
        const oldBudgetCategoryMap: Record<string, 'materials' | 'overhead' | 'external'> = {
          'labor': 'materials',
          'materials': 'materials',
          'overhead': 'overhead',
          'external': 'external',
          'other': 'materials'
        }
        const oldBudgetCategory = oldBudgetCategoryMap[oldCategory] || 'materials'
        const currentOldAmount = (project.budget.categories as any)[oldBudgetCategory] || 0
        ;(project.budget.categories as any)[oldBudgetCategory] = Math.max(0, currentOldAmount - oldFullAmount)

        // Add new amount to new category
        const newBudgetCategory = oldBudgetCategoryMap[category] || 'materials'
        const currentNewAmount = (project.budget.categories as any)[newBudgetCategory] || 0
        ;(project.budget.categories as any)[newBudgetCategory] = currentNewAmount + fullAmount

        // Update total spent
        project.budget.spent = (project.budget.spent || 0) - oldFullAmount + fullAmount
        project.budget.lastUpdated = new Date()
        project.budget.updatedBy = user.id
        await project.save()
      }
    }

    // Populate and return updated expense
    const populatedExpense = await Expense.findById(expense._id)
      .populate('addedBy', 'firstName lastName email')
      .populate('paidBy', 'firstName lastName email')

    return NextResponse.json({
      success: true,
      data: populatedExpense
    })

  } catch (error) {
    console.error('Update expense error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
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

    // Check if user can access this project
    const canAccessProject = await PermissionService.canAccessProject(user.id, projectId)
    if (!canAccessProject) {
      return NextResponse.json(
        { error: 'Access denied to project' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const expenseId = searchParams.get('expenseId')

    if (!expenseId) {
      return NextResponse.json(
        { error: 'Expense ID is required' },
        { status: 400 }
      )
    }

    // Find and validate expense belongs to this project
    const expense = await Expense.findOne({ _id: expenseId, project: projectId })
    if (!expense) {
      return NextResponse.json(
        { error: 'Expense not found or access denied' },
        { status: 404 }
      )
    }

    // Store expense data for budget adjustment
    const expenseAmount = expense.fullAmount
    const expenseCategory = expense.category

    // Delete the expense
    await Expense.findByIdAndDelete(expenseId)

    // Update project budget
    const project = await Project.findById(projectId)
    if (project?.budget) {
      // Map expense categories to budget categories
      const budgetCategoryMap: Record<string, 'materials' | 'overhead' | 'external'> = {
        'labor': 'materials',
        'materials': 'materials',
        'overhead': 'overhead',
        'external': 'external',
        'other': 'materials'
      }

      const budgetCategory = budgetCategoryMap[expenseCategory] || 'materials'
      const currentAmount = (project.budget.categories as any)[budgetCategory] || 0
      ;(project.budget.categories as any)[budgetCategory] = Math.max(0, currentAmount - expenseAmount)

      // Update total spent
      project.budget.spent = Math.max(0, (project.budget.spent || 0) - expenseAmount)
      project.budget.lastUpdated = new Date()
      project.budget.updatedBy = user.id
      await project.save()
    }

    return NextResponse.json({
      success: true,
      message: 'Expense deleted successfully'
    })

  } catch (error) {
    console.error('Delete expense error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

