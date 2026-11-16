'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, Loader2, X } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { Calendar as DateRangeCalendar } from '@/components/ui/calendar'
import { DateRange } from 'react-day-picker'
import { format } from 'date-fns'
import { validateAndCorrectDateRange } from '@/lib/dateRangeValidation'
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
  remainingBudget: number
  burnRate: number
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

function getBurnRateColor(burnRate: number): string {
  if (burnRate > 100) return 'text-red-500 dark:text-red-400 font-bold'
  if (burnRate >= 80) return 'text-amber-500 dark:text-amber-400'
  return 'text-slate-900 dark:text-slate-100'
}

function MemberAvatar({
  name,
  initials,
  avatar,
  size = 32
}: Readonly<{
  name: string
  initials?: string
  avatar?: string
  size?: number
}>) {
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
}: Readonly<ProjectInsightsTabProps>) {
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
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)

  const handleDateRangeChange = useCallback((range: DateRange | undefined) => {
    if (!range) {
      setDateRange(undefined)
      return
    }
    const corrected = validateAndCorrectDateRange(range.from, range.to)
    setDateRange(corrected as DateRange)
  }, [])

  const dateRangeLabel = useMemo(() => {
    if (!dateRange?.from) return 'Date Range'
    if (dateRange.to) {
      return `${format(dateRange.from, 'MMM d')} – ${format(dateRange.to, 'MMM d')}`
    }
    return `${format(dateRange.from, 'MMM d')} – …`
  }, [dateRange])

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

  // Map resource ID to remaining hours from the roster
  const remainingHoursMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const member of roster) {
      map.set(member.id, member.remainingHours)
    }
    return map
  }, [roster])

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
    let result = timeLogs

    // Search filter
    if (logsSearch.trim()) {
      const q = logsSearch.toLowerCase()
      result = result.filter(
        log => log.resourceName.toLowerCase().includes(q) || log.role.toLowerCase().includes(q)
      )
    }

    // Date range filter
    if (dateRange?.from) {
      const fromTime = new Date(dateRange.from).setHours(0, 0, 0, 0)
      const toTime = dateRange.to
        ? new Date(dateRange.to).setHours(23, 59, 59, 999)
        : new Date(dateRange.from).setHours(23, 59, 59, 999)

      result = result.filter(log => {
        const itemDate = new Date(log.rawDate || log.date)
        const time = itemDate.getTime()
        if (Number.isNaN(time)) return false
        return time >= fromTime && time <= toTime
      })
    }

    return result
  }, [timeLogs, logsSearch, dateRange])

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
              Resource Allocation Roster
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Individual contractor burn rate, billing velocity, and direct budget impact
            </p>
          </div>
          <div className="relative w-full sm:w-[256px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <Input
              type="text"
              placeholder="Search resource, role..."
              value={rosterSearch}
              onChange={e => setRosterSearch(e.target.value)}
              className="pl-[36px] pr-3 h-[36px] text-xs bg-white dark:bg-slate-900 rounded-[8px] border-slate-200 dark:border-slate-800 placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Roster Table Box */}
        <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[840px]">
              <thead>
                <tr className="bg-[#f8fafc] dark:bg-slate-900/60 border-b border-slate-200/80 dark:border-slate-800 text-[11px] font-semibold tracking-wider text-slate-400 dark:text-slate-400 uppercase">
                  <th className="py-3.5 px-5">RESOURCE</th>
                  <th className="py-3.5 px-4">ROLE</th>
                  {canViewFinancials && <th className="py-3.5 px-4">RATE</th>}
                  <th className="py-3.5 px-4 text-right">ALLOCATED HRS</th>
                  <th className="py-3.5 px-4 text-right">LOGGED HRS</th>
                  <th className="py-3.5 px-4 text-right">REMAINING HRS</th>
                  {canViewFinancials && <th className="py-3.5 px-4 text-right">REMAINING BUDGET</th>}
                  {canViewFinancials && <th className="py-3.5 px-4 text-right">BURN RATE</th>}
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

                    {/* Remaining Hrs */}
                    <td className="py-3.5 px-4 text-right text-sm font-normal text-slate-600 dark:text-slate-300">
                      {member.remainingHours}h
                    </td>

                    {/* Remaining Budget (HR/Admin only) */}
                    {canViewFinancials && (
                      <td className={cn(
                        "py-3.5 px-4 text-right text-sm font-semibold",
                        member.remainingBudget < 0
                          ? "text-red-500 dark:text-red-400"
                          : "text-slate-900 dark:text-slate-100"
                      )}>
                        {formatCurrency(member.remainingBudget, currency)}
                      </td>
                    )}

                    {/* Burn Rate % (HR/Admin only) */}
                    {canViewFinancials && (
                      <td className="py-3.5 px-4 text-right text-sm font-semibold">
                        <span className={getBurnRateColor(member.burnRate)}>
                          {member.burnRate}%
                        </span>
                      </td>
                    )}

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
                    <td colSpan={canViewFinancials ? 9 : 5} className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
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
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Resource Time Tracking
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {canViewFinancials
                ? 'Hours × Hourly Rate = Cost · Each entry reduces remaining budget'
                : 'Individual logged work hours per task session'}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative w-full sm:w-[256px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <Input
                type="text"
                placeholder="Search resource, role..."
                value={logsSearch}
                onChange={e => setLogsSearch(e.target.value)}
                className="pl-[36px] pr-3 h-[36px] text-xs bg-white dark:bg-slate-900 rounded-[8px] border-slate-200 dark:border-slate-800 placeholder:text-slate-400"
              />
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "relative w-full sm:w-[206px] h-[36px] rounded-[8px] border border-slate-200 dark:border-slate-800",
                    "bg-white dark:bg-slate-900 pl-[36px] pr-[32px] py-[7px]",
                    "text-xs text-left transition-colors flex items-center justify-between shrink-0",
                    dateRange?.from
                      ? "text-slate-900 dark:text-slate-100 font-medium"
                      : "text-slate-400 dark:text-slate-400 font-normal"
                  )}
                >
                  {/* Left Search Icon */}
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />

                  {/* Label / Range */}
                  <span className="truncate">
                    {dateRangeLabel}
                  </span>

                  {/* Right Calendar Icon / Clear button */}
                  {dateRange?.from ? (
                    <span
                      role="button"
                      aria-label="Clear date range"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDateRange(undefined)
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-destructive p-0.5 rounded cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </span>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none"
                    >
                      <path d="M16 2v3" />
                      <path d="m18 21 3-3h-6" />
                      <path d="M21 12.34V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7.35" />
                      <path d="m21 18-3-3" />
                      <path d="M3 9h18" />
                      <path d="M8 2v3" />
                    </svg>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-lg" align="end">
                <DateRangeCalendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={handleDateRangeChange}
                  numberOfMonths={2}
                />
                {dateRange?.from && (
                  <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 dark:border-slate-800 text-xs bg-slate-50/50 dark:bg-slate-900/50">
                    <span className="text-[11px] text-muted-foreground">
                      {dateRange.to
                        ? `${format(dateRange.from, 'MMM d, yyyy')} – ${format(dateRange.to, 'MMM d, yyyy')}`
                        : `From ${format(dateRange.from, 'MMM d, yyyy')}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDateRange(undefined)}
                      className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-destructive transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
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
                  <th className="py-3.5 px-4 text-right">Logged HOURS</th>
                  <th className="py-3.5 px-4 text-right">REMAINING HRS</th>
                  {canViewFinancials && <th className="py-3.5 px-4 text-right">RATE</th>}
                  {canViewFinancials && <th className="py-3.5 px-5 text-right">COST</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {filteredTimeLogs.map(log => {
                  const remainingHrs = remainingHoursMap.get(log.resourceId) ?? 0
                  return (
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

                      {/* Hours */}
                      <td className="py-3.5 px-4 text-right text-sm font-normal text-slate-600 dark:text-slate-300">
                        {log.hours}h
                      </td>

                      {/* Remaining Hrs */}
                      <td className={cn(
                        "py-3.5 px-4 text-right text-sm",
                        remainingHrs <= 8
                          ? "text-red-500 dark:text-red-400 font-semibold"
                          : "font-normal text-slate-600 dark:text-slate-300"
                      )}>
                        {remainingHrs}h
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
                  )
                })}

                {filteredTimeLogs.length === 0 && (
                  <tr>
                    <td colSpan={canViewFinancials ? 6 : 4} className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                      {logsSearch.trim() || dateRange?.from
                        ? 'No time tracking entries match your filters'
                        : 'No time tracking entries found'}
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
