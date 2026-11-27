import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db-config'
import { BudgetEntry } from '@/models/BudgetEntry'
import { Project } from '@/models/Project'
import { authenticateUser } from '@/lib/auth-utils'
import { hasPermission } from '@/lib/permissions/permission-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const budgetEntry = await BudgetEntry.findById(params.id)
      .populate('project', 'name')
      .populate('addedBy', 'firstName lastName email')
      .populate('approvedBy', 'firstName lastName email')

    if (!budgetEntry) {
      return NextResponse.json({ error: 'Budget entry not found' }, { status: 404 })
    }

    // Check if user has access to this project. F8: project:read is held
    // globally by every role, so it never limited this; use project access.
    const hasAccess = await PermissionService.canAccessProject(authResult.user.id, budgetEntry.project._id.toString())
    if (!hasAccess) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    return NextResponse.json(budgetEntry)
  } catch (error) {
    console.error('Error fetching budget entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const body = await req.json()
    const { amount, category, description, billingReference, status, notes } = body

    const budgetEntry = await BudgetEntry.findById(params.id)
    if (!budgetEntry) {
      return NextResponse.json({ error: 'Budget entry not found' }, { status: 404 })
    }

    // Check if user has permission to manage budget for this project
    const hasAccess = await hasPermission(authResult.user.id, Permission.FINANCIAL_MANAGE_BUDGET, budgetEntry.project.toString())
    if (!hasAccess) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const oldAmount = budgetEntry.amount
    const oldCategory = budgetEntry.category

    // Update budget entry
    if (amount !== undefined) budgetEntry.amount = amount
    if (category !== undefined) budgetEntry.category = category
    if (description !== undefined) budgetEntry.description = description
    if (billingReference !== undefined) budgetEntry.billingReference = billingReference
    if (status !== undefined) budgetEntry.status = status
    if (notes !== undefined) budgetEntry.notes = notes

    await budgetEntry.save()

    // Update project budget if amount or category changed
    if (amount !== oldAmount || category !== oldCategory) {
      const project = await Project.findById(budgetEntry.project)
      if (project && project.budget) {
        // Remove old amount from old category
        project.budget.total -= oldAmount
        project.budget.categories[oldCategory] = (project.budget.categories[oldCategory] || 0) - oldAmount
        
        // Add new amount to new category
        project.budget.total += amount
        project.budget.categories[category] = (project.budget.categories[category] || 0) + amount
        project.budget.lastUpdated = new Date()
        project.budget.updatedBy = authResult.user.id
        await project.save()
      }
    }

    const updatedEntry = await BudgetEntry.findById(params.id)
      .populate('project', 'name')
      .populate('addedBy', 'firstName lastName email')
      .populate('approvedBy', 'firstName lastName email')

    return NextResponse.json(updatedEntry)
  } catch (error) {
    console.error('Error updating budget entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const budgetEntry = await BudgetEntry.findById(params.id)
    if (!budgetEntry) {
      return NextResponse.json({ error: 'Budget entry not found' }, { status: 404 })
    }

    // Check if user has permission to manage budget for this project
    const hasAccess = await hasPermission(authResult.user.id, Permission.FINANCIAL_MANAGE_BUDGET, budgetEntry.project.toString())
    if (!hasAccess) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Update project budget
    const project = await Project.findById(budgetEntry.project)
    if (project && project.budget) {
      project.budget.total -= budgetEntry.amount
      project.budget.categories[budgetEntry.category] = (project.budget.categories[budgetEntry.category] || 0) - budgetEntry.amount
      project.budget.lastUpdated = new Date()
      project.budget.updatedBy = authResult.user.id
      await project.save()
    }

    await BudgetEntry.findByIdAndDelete(params.id)

    return NextResponse.json({ message: 'Budget entry deleted successfully' })
  } catch (error) {
    console.error('Error deleting budget entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
