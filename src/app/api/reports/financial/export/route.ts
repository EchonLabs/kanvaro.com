import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { BudgetEntry } from '@/models/BudgetEntry'
import { Project } from '@/models/Project'
import { authenticateUser } from '@/lib/auth-utils'
import { hasPermission } from '@/lib/permissions/permission-utils'
import { Permission } from '@/lib/permissions/permission-definitions'
import { PermissionService } from '@/lib/permissions/permission-service'
import { escapeRegex } from '@/lib/text/escape-regex'

export async function GET(req: NextRequest) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const allowed = await hasPermission(authResult.user.id, Permission.FINANCIAL_READ)
    if (!allowed) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const format = (searchParams.get('format') || 'csv').toLowerCase()
    const type = (searchParams.get('type') || 'overview').toLowerCase()
    const search = searchParams.get('search') || ''
    const category = searchParams.get('category') || ''
    const project = searchParams.get('project') || ''
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // F8: this query had no organisation or project filter, so it exported every
    // budget entry in the database. Scope it to projects the caller can access,
    // as GET /api/reports/financial now does, and match the search literally.
    const accessibleProjectIds = (await PermissionService.getAccessibleProjects(authResult.user.id)).map(String)
    const budgetQuery: any = { project: { $in: accessibleProjectIds } }
    if (search) {
      const pattern = escapeRegex(search)
      budgetQuery.$or = [
        { description: { $regex: pattern, $options: 'i' } },
        { category: { $regex: pattern, $options: 'i' } },
      ]
    }
    if (category && category !== 'all') budgetQuery.category = category
    if (project && project !== 'all') {
      if (!accessibleProjectIds.includes(project)) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
      }
      budgetQuery.project = project
    }
    if (startDate && endDate) {
      budgetQuery.addedAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      }
    }

    // Fetch entries (lightweight for export placeholder)
    const entries = await BudgetEntry.find(budgetQuery)
      .populate('project', 'name')
      .populate('addedBy', 'firstName lastName')
      .lean()

    // If JSON requested, return structured data
    if (format === 'json') {
      return NextResponse.json({
        success: true,
        type,
        count: entries.length,
        data: entries.map((e: any) => ({
          description: e.description,
          amount: e.amount,
          category: e.category,
          project: e.project?.name || '',
          addedBy: e.addedBy ? `${e.addedBy.firstName} ${e.addedBy.lastName}` : '',
          date: e.addedAt ? new Date(e.addedAt).toISOString().split('T')[0] : '',
        })),
      })
    }

    // Default to CSV (also used for 'excel')
    const headers = ['Description','Amount','Category','Project','Added By','Date']
    const rows = entries.map((e: any) => [
      escapeCsv(e.description ?? ''),
      String(e.amount ?? ''),
      escapeCsv(e.category ?? ''),
      escapeCsv(e.project?.name ?? ''),
      escapeCsv(e.addedBy ? `${e.addedBy.firstName} ${e.addedBy.lastName}` : ''),
      e.addedAt ? new Date(e.addedAt).toISOString().split('T')[0] : '',
    ].join(','))

    const bom = '\uFEFF'
    const csv = [headers.join(','), ...rows].join('\n') + '\n'
    const body = bom + csv

    const now = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const filename = `financial-reports-${type}-${now}.csv`

    return new NextResponse(body, {
      status: 200,
      headers: new Headers({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      }),
    })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function escapeCsv(value: string): string {
  if (value == null) return ''
  const needsQuotes = /[",\n]/.test(value)
  const escaped = value.replace(/"/g, '""')
  return needsQuotes ? `"${escaped}"` : escaped
}
