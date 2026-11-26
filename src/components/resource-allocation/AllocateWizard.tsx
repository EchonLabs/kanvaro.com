'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Minus, Plus, Search } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { maxAllowedFor } from '@/lib/resource-allocation/workload'
import { cn } from '@/lib/utils'

import { fetchMember, fetchSheet, submitChange, type MemberAllocations, type Sheet, type SheetRow } from './api'
import { clampPercent } from './ManageAllocationModal'

interface Props {
  mode: 'apply' | 'request'
  currentUserId?: string
  onDone(result: { mode: 'applied' | 'requested' }): void
}

const STEPS = ['Select Employee', 'Select Project', 'Set Allocation', 'Review'] as const

const searchInput =
  'h-10 w-full rounded-[var(--apple-radius-pill)] border border-[var(--apple-separator)] bg-transparent pl-9 pr-3 text-[14px] text-[var(--apple-label)] placeholder:text-[var(--apple-tertiary-label)] focus:outline-none focus:ring-2 focus:ring-[var(--apple-system-blue)]'

const optionClass = (selected: boolean) =>
  cn(
    'flex w-full items-center gap-3 rounded-[var(--apple-radius-md)] border px-3 py-2.5 text-left apple-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-system-blue)] disabled:cursor-not-allowed disabled:opacity-45',
    selected
      ? 'border-[var(--apple-system-blue)] bg-[color-mix(in_srgb,var(--apple-system-blue)_8%,transparent)]'
      : 'border-[var(--apple-separator)] hover:bg-[var(--apple-quaternary-fill)]'
  )

function splitName(name: string) {
  const [firstName, ...rest] = name.split(' ')
  return { firstName, lastName: rest.join(' ') }
}

function SearchBox({ value, onChange, label }: { value: string; onChange(value: string): void; label: string }) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--apple-tertiary-label)]" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={`${label}...`} className={searchInput} />
    </label>
  )
}

/**
 * Allocate one person to one project in four steps. It submits through the
 * same endpoint as the Manage modal: Admin/HR changes apply immediately, a PM's
 * goes to approval.
 */
export function AllocateWizard({ mode, currentUserId, onDone }: Props) {
  const [step, setStep] = useState(0)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [employeeQuery, setEmployeeQuery] = useState('')
  const [projectQuery, setProjectQuery] = useState('')
  const [employee, setEmployee] = useState<SheetRow | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [member, setMember] = useState<MemberAllocations | null>(null)
  const [value, setValue] = useState(0)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSheet({ q: employeeQuery, limit: 50 })
        .then(setSheet)
        .catch((err: Error) => setError(err.message))
    }, employeeQuery ? 250 : 0)
    return () => clearTimeout(timer)
  }, [employeeQuery])

  useEffect(() => {
    if (!employee || step !== 2) return
    setMember(null)
    fetchMember(employee.memberId)
      .then((data) => {
        setMember(data)
        setValue(data.lines.find((line) => line.projectId === projectId)?.percent ?? 0)
      })
      .catch((err: Error) => setError(err.message))
  }, [employee, projectId, step])

  const project = sheet?.projects.find((p) => p._id === projectId)
  const manages = (managers: { _id: string }[]) => mode === 'apply' || managers.some((m) => m._id === currentUserId)

  const projects = useMemo(() => {
    const q = projectQuery.trim().toLowerCase()
    return (sheet?.projects ?? []).filter((p) => !q || p.name.toLowerCase().includes(q))
  }, [sheet, projectQuery])

  const current = member?.lines.find((line) => line.projectId === projectId)?.percent ?? 0
  const otherTotal = (member?.total ?? 0) - current
  const max = member ? maxAllowedFor(otherTotal, member.threshold) : 100
  const totalAfter = otherTotal + value
  const clamp = (next: number) => Math.min(Math.max(next, 0), Math.max(max, current))

  const canContinue =
    (step === 0 && !!employee) || (step === 1 && !!projectId) || (step === 2 && !!member && value !== current)

  const submit = async () => {
    if (!employee || !projectId) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await submitChange({
        memberId: employee.memberId,
        lines: [{ projectId, newPercent: value }],
        reason: reason.trim()
      })
      onDone({ mode: result.mode })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card">
      <ol className="flex flex-wrap gap-x-6 gap-y-2 border-b border-[var(--apple-separator)] px-5 py-4" aria-label="Steps">
        {STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2 text-[13px] font-medium',
              index === step ? 'text-[var(--apple-label)]' : 'text-[var(--apple-tertiary-label)]'
            )}
          >
            <span
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold',
                index < step && 'bg-[var(--apple-system-green)] text-white',
                index === step && 'bg-[var(--apple-system-blue)] text-white',
                index > step && 'bg-[var(--apple-tertiary-fill)]'
              )}
            >
              {index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>

      <div className="space-y-4 p-5">
        {step === 0 && (
          <>
            <p className="text-[14px] text-[var(--apple-secondary-label)]">Choose the employee you want to allocate to the project</p>
            <SearchBox value={employeeQuery} onChange={setEmployeeQuery} label="Search employee" />
            <div className="grid gap-2 sm:grid-cols-2">
              {(sheet?.rows ?? []).map((row) => (
                <button
                  key={row.memberId}
                  type="button"
                  onClick={() => setEmployee(row)}
                  aria-pressed={employee?.memberId === row.memberId}
                  className={optionClass(employee?.memberId === row.memberId)}
                >
                  <GravatarAvatar user={{ ...splitName(row.name), email: row.email, avatar: row.avatar }} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[var(--apple-label)]">{row.name}</span>
                    <span className="block truncate text-[11px] text-[var(--apple-secondary-label)]">{row.roleLabel}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[13px] font-semibold tabular-nums text-[var(--apple-label)]">{row.total}%</span>
                    <span className="block text-[11px] tabular-nums text-[var(--apple-system-green)]">{row.remaining}% available</span>
                  </span>
                </button>
              ))}
              {sheet && sheet.rows.length === 0 && (
                <p className="text-[13px] text-[var(--apple-secondary-label)]">No one matches that search.</p>
              )}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-[14px] text-[var(--apple-secondary-label)]">Choose the project you want to assign {employee?.name} to</p>
            <SearchBox value={projectQuery} onChange={setProjectQuery} label="Search project" />
            {mode === 'request' && (
              <p className="text-[12px] text-[var(--apple-secondary-label)]">You can only add allocation to projects you manage.</p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {projects.map((p) => (
                <button
                  key={p._id}
                  type="button"
                  disabled={!manages(p.managers)}
                  onClick={() => setProjectId(p._id)}
                  aria-pressed={projectId === p._id}
                  className={optionClass(projectId === p._id)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[var(--apple-label)]">{p.name}</span>
                    <span className="block truncate text-[11px] text-[var(--apple-secondary-label)]">
                      {p.managers.length > 0 ? `${p.managers.map((m) => m.name).join(', ')} · Project Manager` : 'No project manager'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && project && (
          <>
            <p className="text-[14px] text-[var(--apple-secondary-label)]">
              Set the percentage of {employee?.name}’s capacity for {project.name}
            </p>
            {!member ? (
              <p className="text-[13px] text-[var(--apple-secondary-label)]">Loading…</p>
            ) : (
              <div className="space-y-4 rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[14px] font-medium text-[var(--apple-label)]">Set allocation for this project</span>
                  <Button variant="outline" size="sm" onClick={() => setValue(clamp(max))}>
                    Max ({max}%)
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" aria-label="Decrease allocation" onClick={() => setValue(clamp(value - 5))}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="relative">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={max}
                      value={value}
                      aria-label={`Allocation for ${project.name}`}
                      onChange={(e) => {
                        const next = clamp(clampPercent(e.target.value))
                        e.target.value = String(next)
                        setValue(next)
                      }}
                      className="h-9 w-24 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-transparent pl-3 pr-7 text-center text-[15px] font-semibold tabular-nums text-[var(--apple-label)] focus:outline-none focus:ring-2 focus:ring-[var(--apple-system-blue)]"
                    />
                    <span aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[13px] text-[var(--apple-tertiary-label)]">
                      %
                    </span>
                  </span>
                  <Button variant="outline" size="icon" aria-label="Increase allocation" onClick={() => setValue(clamp(value + 5))}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 overflow-hidden rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)]">
                  <div className="p-3">
                    <p className="text-[11px] text-[var(--apple-secondary-label)]">Current Allocation</p>
                    <p className="text-[17px] font-semibold tabular-nums text-[var(--apple-label)]">{member.total}%</p>
                  </div>
                  <div className="border-l border-[var(--apple-separator)] p-3">
                    <p className="text-[11px] text-[var(--apple-secondary-label)]">Available</p>
                    <p className="text-[17px] font-semibold tabular-nums text-[var(--apple-system-green)]">
                      {Math.max(0, member.threshold - member.total)}%
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {step === 3 && project && member && (
          <>
            <p className="text-[14px] text-[var(--apple-secondary-label)]">Review the allocation details and confirm the changes before saving</p>
            <div className="space-y-1 rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] p-4">
              <p className="text-[14px] font-medium text-[var(--apple-label)]">
                {employee?.name} on {project.name}
              </p>
              <p className="text-[13px] text-[var(--apple-secondary-label)]">
                Allocation to add:{' '}
                <span className="font-semibold tabular-nums text-[var(--apple-system-blue)]">
                  {value - current > 0 ? `+${value - current}` : value - current}%
                </span>
              </p>
              <p className="text-[13px] tabular-nums text-[var(--apple-label)]">Resulting capacity: {totalAfter}% total</p>
              <p className="text-[13px] tabular-nums text-[var(--apple-system-green)]">{Math.max(0, 100 - totalAfter)}% remaining</p>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-[var(--apple-label)]">Reason for allocation</span>
              <textarea
                value={reason}
                maxLength={500}
                rows={2}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this person needed on the project?"
                className="w-full rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-transparent px-3 py-2 text-[13px] text-[var(--apple-label)] placeholder:text-[var(--apple-tertiary-label)] focus:outline-none focus:ring-2 focus:ring-[var(--apple-system-blue)]"
              />
            </label>
            <p className="text-[12px] text-[var(--apple-secondary-label)]">
              {mode === 'apply'
                ? 'Changes will be updated immediately across the resource matrix and employee profiles.'
                : 'This sends the change to HR for approval. Nothing changes until it is approved.'}
            </p>
          </>
        )}

        {error && (
          <p role="alert" className="text-[13px] text-[var(--apple-system-red)]">
            {error}
          </p>
        )}
      </div>

      <div className="flex justify-between gap-2 border-t border-[var(--apple-separator)] px-5 py-3">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || submitting}>
          Back
        </Button>
        {step < 3 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
            Continue
          </Button>
        ) : (
          <Button onClick={submit} disabled={submitting || reason.trim().length === 0}>
            {mode === 'apply' ? 'Save' : 'Share to Approvals'}
          </Button>
        )}
      </div>
    </div>
  )
}
