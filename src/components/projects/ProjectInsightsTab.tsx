'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

interface RosterMember {
  id: string
  name: string
  firstName?: string
  lastName?: string
  email: string
  avatar?: string
  initials: string
  role: string
  rate: number
  allocatedHours: number
  loggedHours: number
  actualCost: number
  remainingHours: number
  budgetImpact: number
}

interface TimeLogItem {
  id: string
  resourceName: string
  resourceId: string
  firstName?: string
  lastName?: string
  email?: string
  avatar?: string
  role: string
  date: string
  rawDate: string
  hours: number
  rate: number
  cost: number
}

interface ProjectInsightsTabProps {
  projectId: string
  formatCurrency: (amount: number, currency?: string) => string
  currency?: string
  canViewFinancials?: boolean
}

const AVATAR_COLORS = [
  'bg-[#8b5cf6] text-white', // Purple
  'bg-[#2563eb] text-white', // Blue
  'bg-[#d97706] text-white', // Warm amber / orange
  'bg-[#059669] text-white', // Emerald green
  'bg-[#0891b2] text-white', // Teal / cyan
  'bg-[#e11d48] text-white', // Rose
  'bg-[#4f46e5] text-white', // Indigo
  'bg-[#0284c7] text-white', // Sky
]

function getAvatarBgColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(name: string, fallback?: string): string {
  const clean = (name || '').trim()
  if (!clean && fallback) return fallback.trim().slice(0, 2).toUpperCase()
  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return 'U'
}

function MemberAvatar({
  name,
  initials,
  avatar,
  size = 32
}: {
  name: string
  initials?: string
  avatar?: string
  size?: number
}) {
  const [hasError, setHasError] = useState(false)
  const showImage = Boolean(avatar && !hasError)
  const resolvedInitials = initials || getInitials(name)
  const bgClass = getAvatarBgColor(name || resolvedInitials)

  return (
    <div
      style={{ width: size, height: size }}
      className="relative shrink-0 rounded-full overflow-hidden flex items-center justify-center select-none"
    >
      {showImage ? (
        <img
          src={avatar}
          alt={name}
          onError={() => setHasError(true)}
          className="h-full w-full object-cover rounded-full"
        />
      ) : (
        <div className={cn("h-full w-full rounded-full flex items-center justify-center font-bold text-xs", bgClass)}>
          {resolvedInitials}
        </div>
      )}
    </div>
  )
}

export function ProjectInsightsTab({
  projectId,
  formatCurrency,
  currency = 'USD',
  canViewFinancials: canViewFinancialsProp = false
}: ProjectInsightsTabProps) {
  const [roster, setRoster] = useState<RosterMember[]>([])
  const [timeLogs, setTimeLogs] = useState<TimeLogItem[]>([])
  const [canViewFinancials, setCanViewFinancials] = useState<boolean>(canViewFinancialsProp)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (typeof canViewFinancialsProp === 'boolean') {
      setCanViewFinancials(canViewFinancialsProp)
    }
  }, [canViewFinancialsProp])

  const [rosterSearch, setRosterSearch] = useState('')
  const [logsSearch, setLogsSearch] = useState('')

  const fetchInsights = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const response = await fetch(`/api/projects/${projectId}/insights`)
      const res = await response.json()

      if (res.success && res.data) {
        setRoster(res.data.roster || [])
        setTimeLogs(res.data.timeLogs || [])
        if (typeof res.data.canViewFinancials === 'boolean') {
          setCanViewFinancials(res.data.canViewFinancials)
        }
      } else {
        setError(res.error || 'Failed to load project insights')
      }
    } catch {
      setError('Failed to load project insights')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (projectId) {
      void fetchInsights()
    }
  }, [projectId, fetchInsights])

  // Helper for role pill dot color
  const getRoleDot = (role: string) => {
    const lower = (role || '').toLowerCase()
    if (lower.includes('dev') || lower.includes('engineer') || lower.includes('tech')) return 'bg-blue-600'
    if (lower.includes('design') || lower.includes('ui') || lower.includes('ux')) return 'bg-purple-500'
    if (lower.includes('qa') || lower.includes('test')) return 'bg-emerald-500'
    if (lower.includes('ba') || lower.includes('analyst') || lower.includes('business')) return 'bg-cyan-500'
    if (lower.includes('manager') || lower.includes('lead')) return 'bg-indigo-600'
    return 'bg-amber-500'
  }

  // Filtered Roster
  const filteredRoster = useMemo(() => {
    if (!rosterSearch.trim()) return roster
    const q = rosterSearch.toLowerCase()
    return roster.filter(
      r => r.name.toLowerCase().includes(q) || r.role.toLowerCase().includes(q)
    )
  }, [roster, rosterSearch])

  // Filtered Time Logs
  const filteredTimeLogs = useMemo(() => {
    if (!logsSearch.trim()) return timeLogs
    const q = logsSearch.toLowerCase()
    return timeLogs.filter(
      log => log.resourceName.toLowerCase().includes(q) || log.role.toLowerCase().includes(q)
    )
  }, [timeLogs, logsSearch])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
        <p className="text-sm text-muted-foreground">Loading project insights...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive font-medium">{error}</p>
        <button
          onClick={fetchInsights}
          className="mt-3 text-xs font-semibold text-primary underline"
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Card 1: Resource Rate & Allocation Roster */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-card p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Resource Rate & Allocation Roster
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Individual contractor burn rate, billing velocity, and direct budget impact
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search resource, role..."
              value={rosterSearch}
              onChange={e => setRosterSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-white dark:bg-slate-900 rounded-lg border-slate-200 dark:border-slate-800 placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Roster Table Box */}
        <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-[#f8fafc] dark:bg-slate-900/60 border-b border-slate-200/80 dark:border-slate-800 text-[11px] font-semibold tracking-wider text-slate-400 dark:text-slate-400 uppercase">
                  <th className="py-3.5 px-5">RESOURCE</th>
                  <th className="py-3.5 px-4">ROLE</th>
                  {canViewFinancials && <th className="py-3.5 px-4">RATE</th>}
                  <th className="py-3.5 px-4 text-right">ALLOCATED HRS</th>
                  <th className="py-3.5 px-4 text-right">LOGGED HRS</th>
                  {canViewFinancials && <th className="py-3.5 px-4 text-right">ACTUAL COST</th>}
                  <th className="py-3.5 px-4 text-right">REMAINING HRS</th>
                  {canViewFinancials && <th className="py-3.5 px-5 text-right">BUDGET IMPACT</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {filteredRoster.map(member => (
                  <tr key={member.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                    {/* Resource with avatar */}
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <MemberAvatar
                          name={member.name}
                          initials={member.initials}
                          avatar={member.avatar}
                          size={32}
                        />
                        <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                          {member.name}
                        </span>
                      </div>
                    </td>

                    {/* Role with dot */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${getRoleDot(member.role)}`} />
                        <span className="text-sm font-normal text-slate-600 dark:text-slate-300">{member.role}</span>
                      </div>
                    </td>

                    {/* Rate (HR/Admin only) */}
                    {canViewFinancials && (
                      <td className="py-3.5 px-4 text-sm font-normal text-slate-600 dark:text-slate-300">
                        {formatCurrency(member.rate, currency)}/hr
                      </td>
                    )}

                    {/* Allocated Hrs */}
                    <td className="py-3.5 px-4 text-right text-sm font-normal text-slate-600 dark:text-slate-300">
                      {member.allocatedHours}h
                    </td>

                    {/* Logged Hrs */}
                    <td className="py-3.5 px-4 text-right text-sm font-normal text-slate-600 dark:text-slate-300">
                      {member.loggedHours}h
                    </td>

                    {/* Actual Cost (HR/Admin only) */}
                    {canViewFinancials && (
                      <td className="py-3.5 px-4 text-right text-sm font-bold text-slate-900 dark:text-slate-100">
                        {formatCurrency(member.actualCost, currency)}
                      </td>
                    )}

                    {/* Remaining Hrs */}
                    <td className="py-3.5 px-4 text-right text-sm font-normal text-slate-600 dark:text-slate-300">
                      {member.remainingHours}h
                    </td>

                    {/* Budget Impact Pill (HR/Admin only) */}
                    {canViewFinancials && (
                      <td className="py-3.5 px-5 text-right">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60">
                          {formatCurrency(member.budgetImpact, currency)} used
                        </span>
                      </td>
                    )}
                  </tr>
                ))}

                {filteredRoster.length === 0 && (
                  <tr>
                    <td colSpan={canViewFinancials ? 8 : 5} className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                      No resources match your search
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Card 2: Time & Cost Tracking */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-card p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Time & Cost Tracking
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {canViewFinancials
                ? 'Hours × Hourly Rate = Cost · Each entry reduces remaining budget'
                : 'Individual logged work hours per task session'}
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search resource, role..."
              value={logsSearch}
              onChange={e => setLogsSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-white dark:bg-slate-900 rounded-lg border-slate-200 dark:border-slate-800 placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Time Tracking Table Box */}
        <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[650px]">
              <thead>
                <tr className="bg-[#f8fafc] dark:bg-slate-900/60 border-b border-slate-200/80 dark:border-slate-800 text-[11px] font-semibold tracking-wider text-slate-400 dark:text-slate-400 uppercase">
                  <th className="py-3.5 px-5">RESOURCE</th>
                  <th className="py-3.5 px-4">ROLE</th>
                  <th className="py-3.5 px-4">DATE</th>
                  <th className="py-3.5 px-4 text-right">HOURS</th>
                  {canViewFinancials && <th className="py-3.5 px-4 text-right">RATE</th>}
                  {canViewFinancials && <th className="py-3.5 px-5 text-right">COST</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {filteredTimeLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                    {/* Resource (plain text format matching design) */}
                    <td className="py-3.5 px-5 font-semibold text-slate-900 dark:text-slate-100 text-sm">
                      {log.resourceName}
                    </td>

                    {/* Role with dot */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${getRoleDot(log.role)}`} />
                        <span className="text-sm font-normal text-slate-600 dark:text-slate-300">{log.role}</span>
                      </div>
                    </td>

                    {/* Date */}
                    <td className="py-3.5 px-4 text-sm font-normal text-slate-600 dark:text-slate-300">
                      {log.date}
                    </td>

                    {/* Hours */}
                    <td className="py-3.5 px-4 text-right text-sm font-normal text-slate-600 dark:text-slate-300">
                      {log.hours}h
                    </td>

                    {/* Rate (HR/Admin only) */}
                    {canViewFinancials && (
                      <td className="py-3.5 px-4 text-right text-sm font-normal text-slate-600 dark:text-slate-300">
                        {formatCurrency(log.rate, currency)}/hr
                      </td>
                    )}

                    {/* Cost (HR/Admin only) */}
                    {canViewFinancials && (
                      <td className="py-3.5 px-5 text-right text-sm font-bold text-slate-900 dark:text-slate-100">
                        {formatCurrency(log.cost, currency)}
                      </td>
                    )}
                  </tr>
                ))}

                {filteredTimeLogs.length === 0 && (
                  <tr>
                    <td colSpan={canViewFinancials ? 6 : 4} className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                      No time tracking entries found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
