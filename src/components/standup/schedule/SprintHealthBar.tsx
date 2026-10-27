'use client'

/**
 * Sprint Health & Execution Bar (spec §15.7, CC-11, VAR-10).
 *
 * Replaces the shallow completed-days counter with 4 high-signal KPI cards:
 * 1. Sprint Runway & Cadence progress
 * 2. Scope vs Remaining Capacity balance
 * 3. Estimate Debt position across members
 * 4. Active Carry-Forwards & Overrides
 */
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock, Flame, ShieldAlert, Sparkles } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/Card'
import { Progress } from '@/components/ui/Progress'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { SprintHealthSummary } from '@/lib/standup/schedule'
import { formatMinutesAsHours } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

const { health: strings } = standupStrings.schedule

export function SprintHealthBar({
  health
}: {
  health?: SprintHealthSummary
}) {
  if (!health) return null

  const { progress, capacityBalance, estimateDebt, carryForward, overrides } = health

  // 1. Cadence progress
  const hasMissed = progress.missedDays > 0

  // 2. Capacity balance
  const remainingHours = formatMinutesAsHours(capacityBalance.remainingCapacityMinutes)
  const scopeHours = formatMinutesAsHours(capacityBalance.remainingEstimateMinutes)
  const overageHours = formatMinutesAsHours(capacityBalance.overageMinutes)
  const exceedsCapacity = capacityBalance.exceedsCapacity

  // 3. Estimate debt
  const hasDebt = estimateDebt.outstandingMinutes > 0
  const debtHours = formatMinutesAsHours(estimateDebt.outstandingMinutes)

  // 4. Carry forwards & overrides
  const hasCfw = carryForward.openCount > 0
  const hasOverrides = overrides.totalCount > 0

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {/* ── 1. Cadence & Runway ─────────────────────────────────────── */}
      <Card className="border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:shadow-none rounded-[var(--apple-radius-lg)]">
        <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
          <div className="flex items-center justify-between">
            <span className="apple-section-label text-[var(--apple-tertiary-label)]">
              {strings.cadenceTitle()}
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--apple-system-blue)]/10 text-[var(--apple-system-blue)]">
              <Clock className="h-3.5 w-3.5" strokeWidth={2} />
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-apple-mono text-[22px] font-semibold tracking-tight text-[var(--apple-label)] tabular-nums">
                {progress.completedDays} / {progress.totalWorkingDays}
              </span>
              <span className="text-[13px] text-[var(--apple-secondary-label)]">days</span>
            </div>
            <p className="mt-0.5 text-xs text-[var(--apple-secondary-label)]">
              {hasMissed ? (
                <span className="text-[var(--apple-system-red)] font-medium">
                  {progress.missedDays} {progress.missedDays === 1 ? 'day missed' : 'days missed'}
                </span>
              ) : (
                strings.cadenceSub({
                  completed: progress.completedDays,
                  total: progress.totalWorkingDays,
                  percent: progress.percentComplete
                })
              )}
            </p>
          </div>

          <div className="pt-1">
            <Progress
              value={progress.percentComplete}
              className="h-1.5 bg-[var(--apple-tertiary-fill)]"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── 2. Scope vs Capacity (CC-11) ────────────────────────────── */}
      <Card className="border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:shadow-none rounded-[var(--apple-radius-lg)]">
        <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
          <div className="flex items-center justify-between">
            <span className="apple-section-label text-[var(--apple-tertiary-label)]">
              {strings.scopeTitle()}
            </span>
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full',
                exceedsCapacity
                  ? 'bg-[var(--apple-system-orange)]/10 text-[var(--apple-system-orange)]'
                  : 'bg-[var(--apple-system-green)]/10 text-[var(--apple-system-green)]'
              )}
            >
              {exceedsCapacity ? (
                <Flame className="h-3.5 w-3.5" strokeWidth={2} />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
              )}
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <span
                className={cn(
                  'font-apple-mono text-[20px] font-semibold tracking-tight tabular-nums',
                  exceedsCapacity
                    ? 'text-[var(--apple-system-orange)]'
                    : 'text-[var(--apple-system-green)]'
                )}
              >
                {exceedsCapacity ? strings.overCapacity({ overage: overageHours }) : strings.onTrack()}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[var(--apple-secondary-label)] font-apple-mono tabular-nums">
              {strings.scopeDetail({ capacity: remainingHours, scope: scopeHours })}
            </p>
          </div>

          <div className="text-[11px] text-[var(--apple-tertiary-label)] flex items-center gap-1 pt-1">
            <span>{exceedsCapacity ? 'Scope exceeds remaining capacity' : 'Sufficient capacity to complete'}</span>
          </div>
        </CardContent>
      </Card>

      {/* ── 3. Estimate Debt (VAR-10) ────────────────────────────────── */}
      <Card className="border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:shadow-none rounded-[var(--apple-radius-lg)]">
        <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
          <div className="flex items-center justify-between">
            <span className="apple-section-label text-[var(--apple-tertiary-label)]">
              {strings.debtTitle()}
            </span>
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full',
                hasDebt
                  ? 'bg-[var(--apple-system-orange)]/10 text-[var(--apple-system-orange)]'
                  : 'bg-[var(--apple-system-green)]/10 text-[var(--apple-system-green)]'
              )}
            >
              {hasDebt ? (
                <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />
              ) : (
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
              )}
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <span
                className={cn(
                  'font-apple-mono text-[22px] font-semibold tracking-tight tabular-nums',
                  hasDebt ? 'text-[var(--apple-system-orange)]' : 'text-[var(--apple-label)]'
                )}
              >
                {hasDebt ? debtHours : '0.0h'}
              </span>
              <span className="text-[13px] text-[var(--apple-secondary-label)]">
                {hasDebt ? 'overrun' : 'debt'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[var(--apple-secondary-label)]">
              {hasDebt
                ? strings.debtActive({ debt: debtHours, members: estimateDebt.affectedMembersCount })
                : strings.debtClear()}
            </p>
          </div>

          <div className="text-[11px] text-[var(--apple-tertiary-label)] pt-1">
            {strings.debtDetail()}
          </div>
        </CardContent>
      </Card>

      {/* ── 4. Carry-Forwards & Overrides (CFW/OVR) ─────────────────── */}
      <Card className="border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:shadow-none rounded-[var(--apple-radius-lg)]">
        <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
          <div className="flex items-center justify-between">
            <span className="apple-section-label text-[var(--apple-tertiary-label)]">
              {strings.cfwTitle()}
            </span>
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full',
                hasCfw
                  ? 'bg-[var(--apple-system-orange)]/10 text-[var(--apple-system-orange)]'
                  : 'bg-[var(--apple-system-blue)]/10 text-[var(--apple-system-blue)]'
              )}
            >
              <ShieldAlert className="h-3.5 w-3.5" strokeWidth={2} />
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <span
                className={cn(
                  'font-apple-mono text-[22px] font-semibold tracking-tight tabular-nums',
                  hasCfw ? 'text-[var(--apple-system-orange)]' : 'text-[var(--apple-label)]'
                )}
              >
                {carryForward.openCount}
              </span>
              <span className="text-[13px] text-[var(--apple-secondary-label)]">
                {carryForward.openCount === 1 ? 'carry-fwd' : 'carry-fwds'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[var(--apple-secondary-label)]">
              {hasCfw
                ? strings.cfwActive({
                    count: carryForward.openCount,
                    oldest: carryForward.oldestAgeInStandups
                  })
                : strings.cfwClear()}
            </p>
          </div>

          <div className="text-[11px] text-[var(--apple-tertiary-label)] flex items-center justify-between pt-1">
            <span>{strings.overridesCount({ count: overrides.totalCount })}</span>
            {carryForward.chronicCount > 0 && (
              <span className="text-[var(--apple-system-red)] font-medium">
                {carryForward.chronicCount} chronic
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
