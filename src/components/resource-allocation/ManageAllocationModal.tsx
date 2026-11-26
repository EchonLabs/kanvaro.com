'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { classify, exceedsThreshold } from '@/lib/resource-allocation/workload'
import { cn } from '@/lib/utils'

import { ApiError, fetchMember, submitChange, type MemberAllocations } from './api'
import { ChangeHeader, ProjectTile } from './ChangeHeader'
import { ChangeReview } from './ChangeReview'
import { StatusChip } from './StatusChip'

interface Props {
  memberId: string
  open: boolean
  /** `apply` for Admin/HR (changes go live), `request` for PMs (changes go to approval). */
  mode: 'apply' | 'request'
  /** In request mode, a PM may only increase projects they manage (the server enforces the same rule). */
  currentUserId?: string
  onClose(): void
  onDone(result: { mode: 'applied' | 'requested' }): void
}

/** Whole numbers 0–100 only; anything else is pulled into range rather than rejected. */
export function clampPercent(raw: string): number {
  const value = Math.trunc(Number(raw))
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

export function ManageAllocationModal({ memberId, open, mode, currentUserId, onClose, onDone }: Props) {
  const [data, setData] = useState<MemberAllocations | null>(null)
  const [values, setValues] = useState<Record<string, number>>({})
  const [reason, setReason] = useState('')
  const [step, setStep] = useState<'edit' | 'review'>('edit')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setStep('edit')
    setReason('')
    setSubmitError(null)
    setData(null)
    fetchMember(memberId)
      .then((member) => {
        setData(member)
        setValues(Object.fromEntries(member.lines.map((line) => [line.projectId, line.percent])))
        setLoadError(null)
      })
      .catch((error: Error) => setLoadError(error.message))
  }, [memberId, open])

  const summary = useMemo(() => {
    if (!data) return null
    const changed = data.lines
      .filter((line) => (values[line.projectId] ?? line.percent) !== line.percent)
      .map((line) => ({
        projectId: line.projectId,
        projectName: line.projectName,
        previousPercent: line.percent,
        newPercent: values[line.projectId]
      }))
    const totalAfter = data.lines.reduce((sum, line) => sum + (values[line.projectId] ?? line.percent), 0)
    return {
      changed,
      totalAfter,
      over: exceedsThreshold(data.total, totalAfter, data.threshold),
      available: data.threshold - totalAfter
    }
  }, [data, values])

  const canIncrease = (line: MemberAllocations['lines'][number]) =>
    mode === 'apply' || (!!currentUserId && line.managerIds.includes(currentUserId))

  const canReview = !!summary && summary.changed.length > 0 && reason.trim().length > 0 && !summary.over

  const submit = async () => {
    if (!summary) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const result = await submitChange({
        memberId,
        lines: summary.changed.map((line) => ({ projectId: line.projectId, newPercent: line.newPercent })),
        reason: reason.trim()
      })
      onDone({ mode: result.mode })
    } catch (error) {
      setSubmitError(error instanceof ApiError || error instanceof Error ? error.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  const memberName = data?.member.name ?? ''
  const nameParts = memberName.split(' ')

  const footer =
    step === 'edit' ? (
      <>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => setStep('review')} disabled={!canReview} className="gap-2">
          <ArrowRight className="h-4 w-4" />
          Review Changes
        </Button>
      </>
    ) : (
      <>
        <Button variant="ghost" onClick={() => setStep('edit')} disabled={submitting}>
          Back to edit
        </Button>
        <Button onClick={submit} disabled={submitting}>
          {mode === 'apply' ? 'Confirm' : 'Share to Approvals'}
        </Button>
      </>
    )

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={
        step === 'edit' ? 'Manage Allocation' : mode === 'apply' ? 'Confirm Allocation Change' : 'Share Allocation Change'
      }
      description={
        step === 'edit'
          ? 'Manage selected employee’s allocation'
          : `Review the changes for ${memberName} before updating their allocation`
      }
      footer={data ? footer : undefined}
      headerClassName={step === 'review' ? 'text-center sm:text-center' : undefined}
      className="sm:max-w-xl lg:max-w-xl"
    >
      {loadError && (
        <p role="alert" className="text-[14px] text-[var(--apple-system-red)]">
          Couldn’t load this person’s allocation: {loadError}
        </p>
      )}
      {!data && !loadError && <p className="text-[14px] text-[var(--apple-secondary-label)]">Loading…</p>}

      {data && summary && step === 'edit' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <GravatarAvatar user={{ firstName: nameParts[0], lastName: nameParts.slice(1).join(' '), email: data.member.email, avatar: data.member.avatar }} size={36} />
              <div>
                <p className="text-[14px] font-semibold text-[var(--apple-label)]">{data.member.name}</p>
                <p className="text-[12px] text-[var(--apple-secondary-label)]">{data.member.roleLabel}</p>
              </div>
            </div>
            <StatusChip status={classify(summary.totalAfter, data.threshold)} />
          </div>

          <div className="grid grid-cols-2 overflow-hidden rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)]">
            <div className="p-3">
              <p className="text-[11px] text-[var(--apple-secondary-label)]">Total Allocation</p>
              <p className={cn('text-[17px] font-semibold tabular-nums', summary.over ? 'text-[var(--apple-system-red)]' : 'text-[var(--apple-label)]')}>
                {summary.totalAfter}%
              </p>
            </div>
            <div className="border-l border-[var(--apple-separator)] p-3">
              <p className="text-[11px] text-[var(--apple-secondary-label)]">Available Capacity</p>
              <p
                className={cn(
                  'text-[17px] font-semibold tabular-nums',
                  summary.available < 0 ? 'text-[var(--apple-system-red)]' : 'text-[var(--apple-system-green)]'
                )}
              >
                {summary.available}%
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)]">
            <table className="w-full text-[13px]">
              <thead className="bg-[var(--apple-quaternary-fill)] text-[11px] text-[var(--apple-secondary-label)]">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">Project</th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">Current</th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">New allocation</th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">Difference</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((line) => {
                  const next = values[line.projectId] ?? line.percent
                  const difference = next - line.percent
                  const ceiling = canIncrease(line) ? 100 : line.percent
                  return (
                    <tr key={line.projectId} className="border-t border-[var(--apple-separator)]">
                      <td className="px-3 py-2 font-medium text-[var(--apple-label)]">
                        <span className="flex items-center gap-2">
                          <ProjectTile name={line.projectName} />
                          {line.projectName}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[var(--apple-secondary-label)]">{line.percent}%</td>
                      <td className="px-3 py-2">
                        <span className="relative inline-flex items-center">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={ceiling}
                            step={1}
                            value={next}
                            aria-label={`New allocation for ${line.projectName}`}
                            onChange={(event) => {
                              const next = Math.min(ceiling, clampPercent(event.target.value))
                              // When clamping lands on the value already held, React has nothing
                              // to re-render, so write it back or the box keeps what was typed ("00").
                              event.target.value = String(next)
                              setValues((current) => ({ ...current, [line.projectId]: next }))
                            }}
                            className="h-8 w-24 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-transparent pl-2 pr-6 text-[13px] tabular-nums text-[var(--apple-label)] focus:outline-none focus:ring-2 focus:ring-[var(--apple-system-blue)]"
                          />
                          <span aria-hidden className="pointer-events-none absolute right-2 text-[12px] text-[var(--apple-tertiary-label)]">
                            %
                          </span>
                        </span>
                        {!canIncrease(line) && (
                          <span className="mt-0.5 block text-[10px] text-[var(--apple-tertiary-label)]">
                            You can only reduce this project
                          </span>
                        )}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2 tabular-nums',
                          difference > 0 && 'text-[var(--apple-system-green)]',
                          difference < 0 && 'text-[var(--apple-system-red)]',
                          difference === 0 && 'text-[var(--apple-tertiary-label)]'
                        )}
                      >
                        {difference > 0 ? `+${difference}` : difference}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-[var(--apple-label)]">Reason for change</span>
            <textarea
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason for allocation change..."
              rows={2}
              className="w-full rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-transparent px-3 py-2 text-[13px] text-[var(--apple-label)] placeholder:text-[var(--apple-tertiary-label)] focus:outline-none focus:ring-2 focus:ring-[var(--apple-system-blue)]"
            />
          </label>

          {summary.over && (
            <p
              role="alert"
              className="flex items-center gap-2 rounded-[var(--apple-radius-md)] bg-[color-mix(in_srgb,var(--apple-system-red)_10%,transparent)] px-3 py-2 text-[13px] text-[var(--apple-system-red)]"
            >
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              Allocation exceeds available capacity by {summary.totalAfter - data.threshold}%.
            </p>
          )}
        </div>
      )}

      {data && summary && step === 'review' && (
        <div className="space-y-3">
          <ChangeHeader memberName={memberName} />
          <ChangeReview lines={summary.changed} totalAfter={summary.totalAfter} threshold={data.threshold} />
          <p className="rounded-[var(--apple-radius-md)] bg-[color-mix(in_srgb,var(--apple-system-blue)_8%,transparent)] px-3 py-2 text-[13px] text-[var(--apple-system-blue)]">
            {mode === 'apply'
              ? 'This updates the central allocation sheet.'
              : 'This sends the change to HR for approval. Nothing changes until it is approved.'}
          </p>
          {submitError && (
            <p role="alert" className="text-[13px] text-[var(--apple-system-red)]">
              {submitError}
            </p>
          )}
        </div>
      )}
    </ResponsiveDialog>
  )
}
