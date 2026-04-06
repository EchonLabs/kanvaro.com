import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import '@/models/registry'
import { BudgetEntry } from '@/models/BudgetEntry'
import { Project } from '@/models/Project'
import { Expense } from '@/models/Expense'
import { ProjectIncome } from '@/models/ProjectIncome'
import { authenticateUser } from '@/lib/auth-utils'
import { hasPermission } from '@/lib/permissions/permission-utils'
import { Permission } from '@/lib/permissions/permission-definitions'
import { Types } from 'mongoose'

export async function GET(req: NextRequest) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    // Check if user has financial reporting permissions
    const hasAccess = await hasPermission(authResult.user.id, Permission.FINANCIAL_READ)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const organizationId = authResult.user.organization

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')
    const category = searchParams.get('category')
    const project = searchParams.get('project')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const sortBy = searchParams.get('sortBy') || 'date'
    const sortOrder = searchParams.get('sortOrder') || 'desc'

    const hasDateRange = Boolean(startDate && endDate)
    const start = hasDateRange ? new Date(startDate as string) : null
    const end = hasDateRange ? new Date(endDate as string) : null

    if (hasDateRange && (Number.isNaN(start!.getTime()) || Number.isNaN(end!.getTime()))) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
    }

    // Build scoped project set (organization + optional project filter)
    const projectQuery: any = {
      organization: organizationId,
      is_deleted: { $ne: true }
    }

    if (project && project !== 'all') {
      if (!Types.ObjectId.isValid(project)) {
        return NextResponse.json({ error: 'Invalid project filter' }, { status: 400 })
      }
      projectQuery._id = new Types.ObjectId(project)
    }

    const projects = await Project.find(projectQuery)
      .select('name budget')
      .lean()

    const projectIds = projects.map(p => p._id)

    // Build query for budget entries (scoped to the allowed projects)
    let budgetQuery: any = { project: { $in: projectIds } }
    
    if (search) {
      budgetQuery.$or = [
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ]
    }
    
    if (category && category !== 'all') {
      budgetQuery.category = category
    }
    
    if (hasDateRange) {
      budgetQuery.addedAt = {
        $gte: start,
        $lte: end
      }
    }

    // Get budget entries
    const budgetEntries = await BudgetEntry.find(budgetQuery)
      .populate('project', 'name')
      .populate('addedBy', 'firstName lastName')
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })

    // Expense + Income sources (real values)
    const expenseMatch: any = { project: { $in: projectIds } }
    if (category && category !== 'all') {
      expenseMatch.category = category
    }
    if (hasDateRange) {
      expenseMatch.expenseDate = { $gte: start, $lte: end }
    }

    const incomeMatch: any = { organization: organizationId, project: { $in: projectIds } }
    if (hasDateRange) {
      incomeMatch.createdAt = { $gte: start, $lte: end }
    }

    const [spentAgg, revenueAgg] = await Promise.all([
      Expense.aggregate([
        { $match: expenseMatch },
        { $group: { _id: null, total: { $sum: '$fullAmount' } } }
      ]),
      ProjectIncome.aggregate([
        { $match: incomeMatch },
        { $group: { _id: null, total: { $sum: '$utilizableBudget' } } }
      ])
    ])

    const totalSpent = spentAgg?.[0]?.total || 0
    const totalRevenue = revenueAgg?.[0]?.total || 0

    // Total budget: prefer BudgetEntry sum if present, otherwise fall back to project-level budget.total
    const budgetFromEntries = budgetEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0)
    const budgetFromProjects = projects.reduce((sum, p: any) => sum + (p.budget?.total || 0), 0)
    const totalBudget = budgetFromEntries > 0 ? budgetFromEntries : budgetFromProjects

    const netProfit = totalRevenue - totalSpent
    const budgetUtilization = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

    // Calculate budget breakdown by category
    const categoryBreakdown: Record<string, any> = {}

    // Budget side: prefer BudgetEntry categories; fallback to project.budget.categories if no entries
    if (budgetEntries.length > 0) {
      for (const entry of budgetEntries) {
        if (!categoryBreakdown[entry.category]) {
          categoryBreakdown[entry.category] = {
            category: entry.category,
            budgeted: 0,
            spent: 0,
            remaining: 0,
            utilizationRate: 0
          }
        }
        categoryBreakdown[entry.category].budgeted += entry.amount
      }
    } else {
      const seedCategories = ['materials', 'overhead', 'external', 'other']
      for (const cat of seedCategories) {
        categoryBreakdown[cat] = {
          category: cat,
          budgeted: 0,
          spent: 0,
          remaining: 0,
          utilizationRate: 0
        }
      }
      for (const p of projects as any[]) {
        categoryBreakdown.materials.budgeted += p.budget?.categories?.materials || 0
        categoryBreakdown.overhead.budgeted += p.budget?.categories?.overhead || 0
        categoryBreakdown.external.budgeted += p.budget?.categories?.external || 0
      }
    }

    // Spent side: real expenses grouped by category
    const spentByCategoryAgg = await Expense.aggregate([
      { $match: expenseMatch },
      { $group: { _id: '$category', total: { $sum: '$fullAmount' } } }
    ])

    const spentByCategory = new Map<string, number>(
      spentByCategoryAgg.map((row: any) => [row._id, row.total])
    )

    Object.keys(categoryBreakdown).forEach(category => {
      const categorySpent = spentByCategory.get(category) || 0
      categoryBreakdown[category].spent = categorySpent
      categoryBreakdown[category].remaining = categoryBreakdown[category].budgeted - categorySpent
      categoryBreakdown[category].utilizationRate = categoryBreakdown[category].budgeted > 0
        ? (categorySpent / categoryBreakdown[category].budgeted) * 100
        : 0
    })

    // Generate monthly trends (last 12 months)
    const monthlyTrends = await generateMonthlyTrends({
      budgetQuery,
      expenseMatch,
      incomeMatch
    })

    // Get top expenses (real expenses)
    const topExpenseDocs = await Expense.find(expenseMatch)
      .populate('project', 'name')
      .sort({ fullAmount: -1 })
      .limit(10)

    const topExpenses = topExpenseDocs.map((e: any) => ({
      description: e.name,
      amount: e.fullAmount,
      category: e.category,
      project: e.project?.name || 'Unknown',
      date: new Date(e.expenseDate).toISOString().split('T')[0]
    }))

    // Revenue sources (real income grouped by category)
    const incomeByCategoryAgg = await ProjectIncome.aggregate([
      { $match: incomeMatch },
      { $group: { _id: '$category', total: { $sum: '$utilizableBudget' } } },
      { $sort: { total: -1 } }
    ])

    const revenueSources = incomeByCategoryAgg.map((row: any) => ({
      source: row._id,
      amount: row.total,
      percentage: totalRevenue > 0 ? Math.round((row.total / totalRevenue) * 100) : 0
    }))

    return NextResponse.json({
      overview: {
        totalBudget,
        totalSpent,
        totalRevenue,
        netProfit,
        budgetUtilization,
        profitMargin
      },
      budgetBreakdown: Object.values(categoryBreakdown),
      monthlyTrends,
      topExpenses,
      revenueSources
    })
  } catch (error) {
    console.error('Error fetching financial reports:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function generateMonthlyTrends(args: {
  budgetQuery: any
  expenseMatch: any
  incomeMatch: any
}) {
  const now = new Date()
  const months: Array<{ key: string; start: Date; end: Date; label: string }> = []

  for (let i = 11; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999)
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
    const label = start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    months.push({ key, start, end, label })
  }

  const budgetAgg = await BudgetEntry.aggregate([
    { $match: { ...args.budgetQuery } },
    {
      $group: {
        _id: { y: { $year: '$addedAt' }, m: { $month: '$addedAt' } },
        total: { $sum: '$amount' }
      }
    }
  ])

  const expenseAgg = await Expense.aggregate([
    { $match: { ...args.expenseMatch } },
    {
      $group: {
        _id: { y: { $year: '$expenseDate' }, m: { $month: '$expenseDate' } },
        total: { $sum: '$fullAmount' }
      }
    }
  ])

  const incomeAgg = await ProjectIncome.aggregate([
    { $match: { ...args.incomeMatch } },
    {
      $group: {
        _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } },
        total: { $sum: '$utilizableBudget' }
      }
    }
  ])

  const budgetMap = new Map<string, number>()
  for (const row of budgetAgg as any[]) {
    const key = `${row._id.y}-${String(row._id.m).padStart(2, '0')}`
    budgetMap.set(key, row.total)
  }

  const expenseMap = new Map<string, number>()
  for (const row of expenseAgg as any[]) {
    const key = `${row._id.y}-${String(row._id.m).padStart(2, '0')}`
    expenseMap.set(key, row.total)
  }

  const incomeMap = new Map<string, number>()
  for (const row of incomeAgg as any[]) {
    const key = `${row._id.y}-${String(row._id.m).padStart(2, '0')}`
    incomeMap.set(key, row.total)
  }

  return months.map(m => {
    const budget = budgetMap.get(m.key) || 0
    const spent = expenseMap.get(m.key) || 0
    const revenue = incomeMap.get(m.key) || 0
    return {
      month: m.label,
      budget,
      spent,
      revenue,
      profit: revenue - spent
    }
  })
}
