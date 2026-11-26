'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, CheckCircle2, FolderOpen, Minus, Plus, Search, Send } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { maxAllowedFor } from '@/lib/resource-allocation/workload'
import { cn } from '@/lib/utils'

import { fetchMember, fetchSheet, submitChange, type MemberAllocations, type Sheet, type SheetRow } from './api'
import { clampPercent } from './ManageAllocationModal'
import { SheetPagination } from './SheetPagination'

interface Props {
  mode: 'apply' | 'request'
  currentUserId?: string
  onDone(result: { mode: 'applied' | 'requested' }): void
}

const STEPS = ['Select Employee', 'Select Project', 'Set Allocation', 'Review'] as const
const STEP_COPY = [
  { title: 'Select Employee', description: 'Choose the employees you want to allocate to the project' },
  { title: 'Select Project', description: 'Choose the project you want to assign them to' },
  { title: 'Set Allocation', description: 'Set the percentage of each employee’s available capacity for the project' },
  { title: 'Review', description: 'Review the allocation details and confirm the changes before saving' }
] as const

const card = 'rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card'
const box = 'rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] px-3 py-2 text-center'

function splitName(name: string) {
  const [firstName, ...rest] = name.split(' ')
  return { firstName, lastName: rest.join(' ') }
}

function SearchBox({ value, onChange, label }: { value: string; onChange(value: string): void; label: string }) {
  return (
    <label className="relative block w-full sm:w-64">
      <span className="sr-only">{label}</span>
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--apple-tertiary-label)]" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`${label}...`}
        className="h-9 w-full rounded-[var(--apple-radius-pill)] border border-[var(--apple-separator)] bg-transparent pl-9 pr-3 text-[13px] text-[var(--apple-label)] placeholder:text-[var(--apple-tertiary-label)] focus:outline-none focus:ring-2 focus:ring-[var(--apple-system-blue)]"
      />
    </label>
  )
}

function Person({ name, email, avatar, roleLabel }: { name: string; email: string; avatar?: string; roleLabel: string }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <GravatarAvatar user={{ ...splitName(name), email, avatar }} size={32} />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-[var(--apple-label)]">{name}</span>
        <span className="block truncate text-[11px] text-[var(--apple-secondary-label)]">{roleLabel}</span>
      </span>
    </span>
  )
}

/**
 * Allocate one or more people to one project, in four steps. Each person is
 * submitted as their own change through the same endpoint as the Manage
 * modal: Admin/HR changes apply immediately, a PM's go to approval. People
 * whose change is refused stay in the wizard with the reason, so they can be
 * fixed and resubmitted without redoing the others.
 */
export function AllocateWizard({ mode, currentUserId, onDone }: Props) {
  const [step, setStep] = useState(0)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [projectSheet, setProjectSheet] = useState<Sheet | null>(null)
  const [employeeQuery, setEmployeeQuery] = useState('')
  const [projectQuery, setProjectQuery] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [selected, setSelected] = useState<Map<string, SheetRow>>(new Map())
  const [projectId, setProjectId] = useState<string | null>(null)
  const [members, setMembers] = useState<Map<string, MemberAllocations>>(new Map())
  const [values, setValues] = useState<Record<string, number>>({})
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const timer = setTimeout(
      () => {
        fetchSheet({ q: employeeQuery, page, limit })
          .then((data) => {
            setSheet(data)
            setProjectSheet((current) => current ?? data)
          })
          .catch((err: Error) => setLoadError(err.message))
      },
      employeeQuery ? 250 : 0
    )
    return () => clearTimeout(timer)
  }, [employeeQuery, page, limit])

  // Load each selected person's live allocation once, when the allocation step opens.
  useEffect(() => {
    if (step !== 2 || !projectId) return
    const missing = Array.from(selected.keys()).filter((id) => !members.has(id))
    if (missing.length === 0) return
    Promise.all(missing.map((id) => fetchMember(id)))
      .then((loaded) => {
        setMembers((current) => {
          const next = new Map(current)
          for (const member of loaded) next.set(member.member._id, member)
          return next
        })
        setValues((current) => {
          const next = { ...current }
          for (const member of loaded) {
            if (next[member.member._id] === undefined) {
              next[member.member._id] = member.lines.find((line) => line.projectId === projectId)?.percent ?? 0
            }
          }
          return next
        })
      })
      .catch((err: Error) => setLoadError(err.message))
  }, [step, projectId, selected, members])

  const projects = useMemo(() => {
    const q = projectQuery.trim().toLowerCase()
    return (projectSheet?.projects ?? []).filter((p) => !q || p.name.toLowerCase().includes(q))
  }, [projectSheet, projectQuery])
  const project = projectSheet?.projects.find((p) => p._id === projectId)
  const manages = (managers: { _id: string }[]) => mode === 'apply' || managers.some((m) => m._id === currentUserId)

  const people = Array.from(selected.values())
  const figures = (memberId: string) => {
    const member = members.get(memberId)
    const current = member?.lines.find((line) => line.projectId === projectId)?.percent ?? 0
    const otherTotal = (member?.total ?? 0) - current
    const max = member ? maxAllowedFor(otherTotal, member.threshold) : 100
    const value = values[memberId] ?? current
    return { member, current, otherTotal, max, value, totalAfter: otherTotal + value }
  }
  const clampFor = (memberId: string, next: number) => {
    const { max, current } = figures(memberId)
    return Math.min(Math.max(next, 0), Math.max(max, current))
  }
  const setValue = (memberId: string, next: number) => setValues((v) => ({ ...v, [memberId]: clampFor(memberId, next) }))

  const allLoaded = people.every((person) => members.has(person.memberId))
  const anyChange = people.some((person) => figures(person.memberId).value !== figures(person.memberId).current)

  const canContinue =
    (step === 0 && selected.size > 0) || (step === 1 && !!projectId) || (step === 2 && allLoaded && anyChange)

  const toggle = (row: SheetRow) =>
    setSelected((current) => {
      const next = new Map(current)
      if (next.has(row.memberId)) next.delete(row.memberId)
      else next.set(row.memberId, row)
      return next
    })

  const submit = async () => {
    if (!projectId) return
    setSubmitting(true)
    setErrors([])
    const failures: string[] = []
    const failed = new Map<string, SheetRow>()
    let resultMode: 'applied' | 'requested' = mode === 'apply' ? 'applied' : 'requested'
    for (const person of people) {
      const { value, current } = figures(person.memberId)
      if (value === current) continue
      try {
        const result = await submitChange({
          memberId: person.memberId,
          lines: [{ projectId, newPercent: value }],
          reason: reason.trim()
        })
        resultMode = result.mode
      } catch (err) {
        failures.push(`${person.name}: ${err instanceof Error ? err.message : 'Something went wrong.'}`)
        failed.set(person.memberId, person)
      }
    }
    setSubmitting(false)
    if (failures.length === 0) {
      onDone({ mode: resultMode })
      return
    }
    // Keep only the people who still need attention.
    setSelected(failed)
    setErrors(failures)
  }

  const finalLabel = mode === 'apply' ? 'Save' : 'Share to Approvals'
  const copy = STEP_COPY[step]

  return (
    <div className="space-y-4">
      {/* Steps on the left, the step actions on the right — as in the design. */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <nav aria-label="Steps">
          <ol className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {STEPS.map((label, index) => (
              <li
                key={label}
                aria-current={index === step ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2 text-[13px] font-medium',
                  index <= step ? 'text-[var(--apple-system-green)]' : 'text-[var(--apple-tertiary-label)]',
                  index === step && 'text-[var(--apple-label)]'
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
                {index < STEPS.length - 1 && (
                  <span aria-hidden className="ml-1 hidden w-8 border-t border-dashed border-[var(--apple-separator)] sm:block" />
                )}
              </li>
            ))}
          </ol>
        </nav>
        <div className="flex items-center gap-2">
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={submitting}>
              Back
            </Button>
          )}
          {step < 3 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue} className="gap-2">
              <ArrowRight className="h-4 w-4" />
              Continue
            </Button>
          ) : (
            <Button onClick={submit} disabled={submitting || reason.trim().length === 0} className="gap-2">
              {mode === 'apply' ? <CheckCircle2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              {finalLabel}
            </Button>
          )}
        </div>
      </div>

      <section className={card}>
        <div className="flex flex-col gap-3 border-b border-[var(--apple-separator)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">{copy.title}</h2>
            <p className="text-[12px] text-[var(--apple-secondary-label)]">{copy.description}</p>
          </div>
          {step === 0 && <SearchBox value={employeeQuery} onChange={(v) => { setEmployeeQuery(v); setPage(1) }} label="Search employee" />}
          {step === 1 && <SearchBox value={projectQuery} onChange={setProjectQuery} label="Search project" />}
          {step >= 2 && project && (
            <span className="inline-flex items-center gap-1.5 rounded-[var(--apple-radius-pill)] border border-[var(--apple-separator)] px-3 py-1 text-[12px] font-semibold text-[var(--apple-label)]">
              <FolderOpen className="h-3.5 w-3.5 text-[var(--apple-system-blue)]" />
              {project.name}
            </span>
          )}
        </div>

        <div className="space-y-3 p-5">
          {step === 0 && sheet && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-[var(--apple-secondary-label)]">
                <span>
                  Showing {sheet.rows.length === 0 ? 0 : (sheet.pagination.page - 1) * sheet.pagination.limit + 1} -{' '}
                  {(sheet.pagination.page - 1) * sheet.pagination.limit + sheet.rows.length} of {sheet.pagination.total}
                </span>
                {selected.size > 0 && (
                  <span className="flex items-center gap-2">
                    <span className="rounded-full bg-[color-mix(in_srgb,var(--apple-system-blue)_14%,transparent)] px-2 py-0.5 font-medium text-[var(--apple-system-blue)]">
                      {selected.size} {selected.size === 1 ? 'employee' : 'employees'} selected
                    </span>
                    <button type="button" onClick={() => setSelected(new Map())} className="font-medium text-[var(--apple-system-blue)] hover:underline">
                      Clear selection
                    </button>
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {sheet.rows.map((row) => {
                  const checked = selected.has(row.memberId)
                  return (
                    <label
                      key={row.memberId}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-[var(--apple-radius-md)] border px-3 py-2.5 apple-transition focus-within:ring-2 focus-within:ring-[var(--apple-system-blue)]',
                        checked
                          ? 'border-[var(--apple-system-blue)] bg-[color-mix(in_srgb,var(--apple-system-blue)_6%,transparent)]'
                          : 'border-[var(--apple-separator)] hover:bg-[var(--apple-quaternary-fill)]'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(row)}
                        aria-label={`${row.name}, ${row.roleLabel}`}
                        className="h-4 w-4 accent-[var(--apple-system-blue)]"
                      />
                      <span className="flex-1">
                        <Person name={row.name} email={row.email} avatar={row.avatar} roleLabel={row.roleLabel} />
                      </span>
                      <span className="text-right">
                        <span className="block text-[13px] font-semibold tabular-nums text-[var(--apple-label)]">{row.total}%</span>
                        <span className="block text-[11px] tabular-nums text-[var(--apple-system-green)]">{row.remaining}% available</span>
                      </span>
                    </label>
                  )
                })}
                {sheet.rows.length === 0 && <p className="text-[13px] text-[var(--apple-secondary-label)]">No one matches that search.</p>}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              {mode === 'request' && (
                <p className="text-[12px] text-[var(--apple-secondary-label)]">You can only add allocation to projects you manage.</p>
              )}
              <div role="radiogroup" aria-label="Project" className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {projects.map((p) => {
                  const chosen = projectId === p._id
                  return (
                    <button
                      key={p._id}
                      type="button"
                      role="radio"
                      aria-checked={chosen}
                      disabled={!manages(p.managers)}
                      onClick={() => {
                        // Percentages belong to a project; picking another starts from live values.
                        if (p._id !== projectId) setValues({})
                        setProjectId(p._id)
                      }}
                      className={cn(
                        'relative flex items-center gap-3 rounded-[var(--apple-radius-md)] border px-3 py-3 text-left apple-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-system-blue)] disabled:cursor-not-allowed disabled:opacity-45',
                        chosen
                          ? 'border-[var(--apple-system-blue)] bg-[color-mix(in_srgb,var(--apple-system-blue)_6%,transparent)]'
                          : 'border-[var(--apple-separator)] hover:bg-[var(--apple-quaternary-fill)]'
                      )}
                    >
                      <FolderOpen className="h-5 w-5 flex-shrink-0 text-[var(--apple-secondary-label)]" strokeWidth={1.5} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-[var(--apple-label)]">{p.name}</span>
                        <span className="block truncate text-[11px] text-[var(--apple-secondary-label)]">
                          {p.managers.length > 0 ? `${p.managers.map((m) => m.name).join(', ')} · Project Manager` : 'No project manager'}
                        </span>
                      </span>
                      {chosen && <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-[var(--apple-system-blue)]" />}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {step === 2 && project && (
            <div className="divide-y divide-[var(--apple-separator)]">
              {people.map((person) => {
                const { member, current, max, value } = figures(person.memberId)
                return (
                  <div key={person.memberId} className="grid grid-cols-1 items-center gap-3 py-3 lg:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1.6fr)]">
                    <Person name={person.name} email={person.email} avatar={person.avatar} roleLabel={person.roleLabel} />
                    {!member ? (
                      <p className="text-[13px] text-[var(--apple-secondary-label)]">Loading…</p>
                    ) : (
                      <>
                        <div className="flex gap-2">
                          <div className={box}>
                            <p className="text-[10px] text-[var(--apple-secondary-label)]">Current Allocation</p>
                            <p className="text-[15px] font-semibold tabular-nums text-[var(--apple-label)]">{member.total}%</p>
                          </div>
                          <div className={box}>
                            <p className="text-[10px] text-[var(--apple-secondary-label)]">Available</p>
                            <p className="text-[15px] font-semibold tabular-nums text-[var(--apple-system-green)]">
                              {Math.max(0, member.threshold - member.total)}%
                            </p>
                          </div>
                        </div>
                        <div className="rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] text-[var(--apple-secondary-label)]">Set allocation for this project</span>
                            <button
                              type="button"
                              onClick={() => setValue(person.memberId, max)}
                              className="rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] px-2 py-0.5 text-[11px] font-medium text-[var(--apple-label)] hover:bg-[var(--apple-quaternary-fill)]"
                            >
                              Max ({max}%)
                            </button>
                          </div>
                          <div className="mt-2 flex items-center justify-end gap-2">
                            <Button variant="outline" size="icon" aria-label={`Decrease allocation for ${person.name}`} onClick={() => setValue(person.memberId, value - 5)}>
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="relative">
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={Math.max(max, current)}
                                value={value}
                                aria-label={`Allocation for ${person.name} on ${project.name}`}
                                onChange={(e) => {
                                  const next = clampFor(person.memberId, clampPercent(e.target.value))
                                  e.target.value = String(next)
                                  setValues((v) => ({ ...v, [person.memberId]: next }))
                                }}
                                className="h-9 w-20 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-transparent pl-3 pr-7 text-center text-[14px] font-semibold tabular-nums text-[var(--apple-label)] focus:outline-none focus:ring-2 focus:ring-[var(--apple-system-blue)]"
                              />
                              <span aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-[var(--apple-tertiary-label)]">
                                %
                              </span>
                            </span>
                            <Button variant="outline" size="icon" aria-label={`Increase allocation for ${person.name}`} onClick={() => setValue(person.memberId, value + 5)}>
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {step === 3 && project && (
            <>
              <div className="divide-y divide-[var(--apple-separator)]">
                {people.map((person) => {
                  const { value, current, totalAfter } = figures(person.memberId)
                  const used = Math.min(100, totalAfter)
                  return (
                    <div
                      key={person.memberId}
                      data-review-row
                      className="grid grid-cols-1 items-center gap-3 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto]"
                    >
                      <Person name={person.name} email={person.email} avatar={person.avatar} roleLabel={person.roleLabel} />
                      <div>
                        <div className="flex justify-between text-[11px]">
                          <span className="font-semibold tabular-nums text-[var(--apple-label)]">Resulting capacity: {totalAfter}% total</span>
                          <span className="tabular-nums text-[var(--apple-system-green)]">{Math.max(0, 100 - totalAfter)}% remaining</span>
                        </div>
                        <span aria-hidden className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-[var(--apple-tertiary-fill)]">
                          <span className="block h-full rounded-full bg-[var(--apple-system-blue)]" style={{ width: `${used}%` }} />
                        </span>
                      </div>
                      <div className={box}>
                        <p className="text-[10px] text-[var(--apple-secondary-label)]">New allocation</p>
                        <p className="text-[14px] font-semibold tabular-nums text-[var(--apple-system-blue)]">
                          {value}%
                          {value !== current && (
                            <span className="ml-1 text-[11px] font-medium text-[var(--apple-secondary-label)]">
                              ({value - current > 0 ? `+${value - current}` : value - current})
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-[var(--apple-label)]">Reason for allocation</span>
                <textarea
                  value={reason}
                  maxLength={500}
                  rows={2}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why are these people needed on the project?"
                  className="w-full rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-transparent px-3 py-2 text-[13px] text-[var(--apple-label)] placeholder:text-[var(--apple-tertiary-label)] focus:outline-none focus:ring-2 focus:ring-[var(--apple-system-blue)]"
                />
              </label>
              <p className="flex items-center gap-2 rounded-[var(--apple-radius-md)] bg-[color-mix(in_srgb,var(--apple-system-blue)_8%,transparent)] px-3 py-2 text-[12px] text-[var(--apple-system-blue)]">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                {mode === 'apply'
                  ? 'Changes will be updated immediately across the resource matrix and employee profiles.'
                  : 'These changes go to HR for approval. Nothing changes until they are approved.'}
              </p>
            </>
          )}

          {errors.length > 0 && (
            <div role="alert" className="space-y-1 rounded-[var(--apple-radius-md)] bg-[color-mix(in_srgb,var(--apple-system-red)_10%,transparent)] px-3 py-2 text-[13px] text-[var(--apple-system-red)]">
              <p className="font-medium">These changes weren’t saved; the rest were:</p>
              {errors.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}
          {loadError && (
            <p role="alert" className="text-[13px] text-[var(--apple-system-red)]">
              {loadError}
            </p>
          )}
        </div>

        {step === 0 && sheet && sheet.pagination.total > 0 && (
          <SheetPagination
            page={sheet.pagination.page}
            limit={sheet.pagination.limit}
            total={sheet.pagination.total}
            shown={sheet.rows.length}
            noun="employees"
            onPage={setPage}
            onLimit={(next) => {
              setLimit(next)
              setPage(1)
            }}
          />
        )}
      </section>
    </div>
  )
}
