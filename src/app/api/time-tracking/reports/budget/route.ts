import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { TimeEntry } from '@/models/TimeEntry'
import { User } from '@/models/User'
import { Project } from '@/models/Project'
import { Organization } from '@/models/Organization'

// Map user role to a display label for the Employment column
function getRoleLabel(role: string): string {
    const roleMap: Record<string, string> = {
        'super_admin': 'Admin',
        'admin': 'Admin',
        'human_resource': 'HR',
        'project_manager': 'PM/ BA',
        'team_member': 'SE',
        'qa_engineer': 'QA',
        'tester': 'QA',
        'client': 'Client',
        'viewer': 'Viewer',
    }
    return roleMap[role] || role
}

function escapeCsvValue(val: string): string {
    if (val.includes('"') || val.includes(',') || val.includes('\n') || val.includes('\r')) {
        return '"' + val.replace(/"/g, '""') + '"'
    }
    return val
}

export async function GET(request: NextRequest) {
    try {
        await connectDB()

        const { searchParams } = new URL(request.url)
        const organizationId = searchParams.get('organizationId')
        const startDate = searchParams.get('startDate')
        const endDate = searchParams.get('endDate')

        if (!organizationId) {
            return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 })
        }

        // Build date range
        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        const end = endDate ? new Date(endDate) : new Date()
        if (endDate) {
            end.setHours(23, 59, 59, 999)
        }

        // Fetch org default rate
        const organization = await Organization.findById(organizationId).lean()
        const orgDefaultRate = (organization as any)?.settings?.timeTracking?.defaultHourlyRate || 0

        // Fetch all active users in the organization (including hourlyRate for fallback)
        const allUsers = await User.find({
            organization: organizationId,
            isActive: true,
        })
            .select('firstName lastName email role hourlyRate')
            .sort({ role: 1, firstName: 1, lastName: 1 })
            .lean()

        // Fetch approved time entries in the date range, populate project with memberRates & budget
        const entries = await TimeEntry.find({
            organization: organizationId,
            startTime: { $gte: start, $lte: end },
            status: 'completed',
            isApproved: true,
            isReject: { $ne: true },
        })
            .populate('project', 'name budget memberRates teamMembers')
            .populate('user', 'firstName lastName email role hourlyRate')
            .lean()

        // Collect all unique project names from entries (sorted alphabetically)
        const projectNameSet = new Set<string>()
        for (const entry of entries as any[]) {
            const projectName = entry.project?.name
            if (projectName) {
                projectNameSet.add(projectName)
            }
        }
        const projectNames = Array.from(projectNameSet).sort()

        // Build pivot: userId -> projectName -> totalCost
        // Cost = (duration in minutes / 60) * effective hourly rate
        // Rate hierarchy: teamMembers rate > memberRates rate > project default rate > user rate > org default rate
        const pivot: Record<string, Record<string, number>> = {}

        for (const entry of entries as any[]) {
            const userId = (entry.user?._id || entry.user)?.toString()
            const projectName = entry.project?.name
            if (!userId || !projectName) continue

            const duration = entry.duration || 0 // in minutes

            // Determine effective hourly rate
            let effectiveRate = 0

            // 1. Project teamMembers specific rate (primary storage)
            const teamMember = entry.project?.teamMembers?.find(
                (tm: any) => (tm.memberId || tm)?.toString() === userId
            )
            if (teamMember?.hourlyRate !== undefined && teamMember?.hourlyRate !== null) {
                effectiveRate = teamMember.hourlyRate
            }
            // 2. Project memberRates specific rate (legacy)
            else {
                const projectMemberRate = entry.project?.memberRates?.find(
                    (rate: any) => rate.user?.toString() === userId
                )
                if (projectMemberRate?.hourlyRate !== undefined && projectMemberRate?.hourlyRate !== null) {
                    effectiveRate = projectMemberRate.hourlyRate
                }
                // 3. Project default hourly rate
                else if (entry.project?.budget?.defaultHourlyRate !== undefined && entry.project?.budget?.defaultHourlyRate !== null) {
                    effectiveRate = entry.project.budget.defaultHourlyRate
                }
                // 4. User's default hourly rate
                else if (entry.user?.hourlyRate !== undefined && entry.user?.hourlyRate !== null) {
                    effectiveRate = entry.user.hourlyRate
                }
                // 5. Organization default rate
                else {
                    effectiveRate = orgDefaultRate
                }
            }

            const cost = (duration / 60) * effectiveRate

            if (!pivot[userId]) pivot[userId] = {}
            pivot[userId][projectName] = (pivot[userId][projectName] || 0) + cost
        }

        // Build CSV rows: Employment, Name, ...projectNames (cost values)
        const headers = ['Employment', 'Name', ...projectNames]
        const rows: string[][] = []

        for (const user of allUsers as any[]) {
            const userId = user._id.toString()
            const employment = getRoleLabel(user.role || 'team_member')
            const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
            const projectCosts = projectNames.map(pName => {
                const cost = pivot[userId]?.[pName] || 0
                if (cost <= 0) return ''
                return Math.round(cost).toLocaleString()
            })
            rows.push([employment, name, ...projectCosts])
        }

        // Sort rows: by Employment label, then by Name
        rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))

        // Build CSV string
        const csvLines = [
            headers.map(escapeCsvValue).join(','),
            ...rows.map(row => row.map(escapeCsvValue).join(','))
        ]
        const csv = '\uFEFF' + csvLines.join('\r\n') + '\r\n'

        // Build filename
        const dateRange = startDate && endDate ? `_${startDate}_to_${endDate}` : ''
        const filename = `Budget_Report${dateRange}.csv`

        return new NextResponse(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Cache-Control': 'no-store',
            },
        })
    } catch (error) {
        console.error('Error generating budget report:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
