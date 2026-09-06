'use client'

import { useMemo, useState } from 'react'

import { standupStrings } from '@/lib/standup/strings'

/**
 * Panel 4 — the carry-forward register (§13, CFW-1..11).
 *
 * Three things this panel has to get right, straight from the spec:
 *
 * **Sorted oldest first, always** (CFW-10). The server already returns items
 * that way; the panel does not re-sort them, so a filter can narrow the list
 * without ever changing what "top of the list" means.
 *
 * **The note thread is never collapsed away** (CFW-5) — "so the PM can see
 * whether the same excuse has appeared five days running" only works if the
 * thread is the first thing visible on an aged item, not a click away.
 *
 * **A note that fails validation says why, inline** (CFW-4). `NOTE_UNCHANGED`
 * and "too short" are different failures with different fixes, so the panel
 * surfaces whatever the server actually said rather than one generic error.
 */

export interface CarryForwardNoteView {
  standupDate: string
  authorName?: string
  text: string
  createdAt: string
}

export interface CarryForwardItemRow {
  itemId: string
  type: string
  status: string
  taskId?: string
  taskKey?: string
  taskTitle?: string
  memberId?: string
  memberName?: string
  originDate: string
  ageInStandups: number
  ageBand: 'normal' | 'note_required' | 'escalated' | 'chronic'
  requiresNoteToday: boolean
  notedToday: boolean
  tags: string[]
  notes: CarryForwardNoteView[]
  resolution?: { resolutionType: string; comment?: string }
  validResolutions: string[]
}

export interface CarryForwardPanelData {
  items: CarryForwardItemRow[]
  summary: {
    totalOpen: number
    needingNoteToday: number
    escalated: number
    resolvedYesterday: number
  }
}

export interface CarryForwardPanelApi {
  addNote(input: { itemId: string; text: string }): Promise<void>
  resolve(input: { itemId: string; resolutionType: string; comment?: string }): Promise<void>
}

export interface CarryForwardPanelProps {
  data: CarryForwardPanelData
  api: CarryForwardPanelApi
  disabled?: boolean
}

const OPEN_STATUSES = ['open', 'noted', 'escalated']

export function CarryForwardPanel({ data, api, disabled = false }: CarryForwardPanelProps) {
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [ageFilter, setAgeFilter] = useState<string>('all')
  const [draftText, setDraftText] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const types = useMemo(
    () => Array.from(new Set(data.items.map((item) => item.type))),
    [data.items]
  )

  const visible = data.items.filter((item) => {
    if (typeFilter !== 'all' && item.type !== typeFilter) return false
    if (ageFilter !== 'all' && item.ageBand !== ageFilter) return false
    return true
  })

  const submitNote = async (item: CarryForwardItemRow) => {
    const text = (draftText[item.itemId] ?? '').trim()
    setErrors((current) => ({ ...current, [item.itemId]: '' }))
    try {
      await api.addNote({ itemId: item.itemId, text })
      setDraftText((current) => ({ ...current, [item.itemId]: '' }))
    } catch (error) {
      const code = (error as { code?: string })?.code
      const message =
        code === 'NOTE_UNCHANGED'
          ? standupStrings.carryForward.noteUnchanged()
          : standupStrings.carryForward.noteTooShort({
              minLength: 10
            })
      setErrors((current) => ({ ...current, [item.itemId]: message }))
    }
  }

  const resolve = async (item: CarryForwardItemRow, resolutionType: string) => {
    try {
      await api.resolve({ itemId: item.itemId, resolutionType })
    } catch {
      setErrors((current) => ({
        ...current,
        [item.itemId]: 'That could not be resolved. Try again.'
      }))
    }
  }

  return (
    <section id="panel-4" aria-labelledby="panel-4-heading" className="flex flex-col gap-3">
      <h3 id="panel-4-heading" className="text-sm font-semibold">
        {standupStrings.carryForward.title()}
      </h3>
      <p className="text-xs text-muted-foreground">{standupStrings.carryForward.subtitle()}</p>

      {/* CFW-11's summary strip. */}
      <div className="flex flex-wrap gap-2 text-xs" data-testid="carry-forward-summary">
        <span className="rounded-full border border-border px-2 py-0.5">
          {standupStrings.carryForward.summaryOpen({ count: data.summary.totalOpen })}
        </span>
        <span
          className={
            data.summary.needingNoteToday > 0
              ? 'rounded-full border border-amber-400 bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200'
              : 'rounded-full border border-border px-2 py-0.5'
          }
        >
          {standupStrings.carryForward.summaryNeedingNote({ count: data.summary.needingNoteToday })}
        </span>
        <span className="rounded-full border border-border px-2 py-0.5">
          {standupStrings.carryForward.summaryEscalated({ count: data.summary.escalated })}
        </span>
        <span className="rounded-full border border-border px-2 py-0.5">
          {standupStrings.carryForward.summaryResolved({ count: data.summary.resolvedYesterday })}
        </span>
      </div>

      {/* CFW-10's filters. */}
      <div className="flex flex-wrap gap-2 text-xs">
        <label className="flex items-center gap-1">
          {standupStrings.carryForward.filterType()}
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="h-7 rounded-md border border-border bg-background px-1"
          >
            <option value="all">All</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {standupStrings.carryForward.itemTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          {standupStrings.carryForward.filterAgeBand()}
          <select
            value={ageFilter}
            onChange={(event) => setAgeFilter(event.target.value)}
            className="h-7 rounded-md border border-border bg-background px-1"
          >
            <option value="all">All</option>
            <option value="normal">Normal</option>
            <option value="note_required">Needs a note</option>
            <option value="escalated">Escalated</option>
            <option value="chronic">Chronic</option>
          </select>
        </label>
        <span className="ml-auto self-center text-muted-foreground">
          {standupStrings.carryForward.sortedByAge()}
        </span>
      </div>

      {visible.length === 0 && (
        <p className="text-sm text-muted-foreground">{standupStrings.carryForward.empty()}</p>
      )}

      <ul className="flex flex-col gap-3">
        {visible.map((item) => {
          const resolved = !OPEN_STATUSES.includes(item.status)

          return (
            <li
              key={item.itemId}
              data-testid={`carry-forward-item-${item.itemId}`}
              className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{item.taskKey ?? standupStrings.carryForward.itemTypeLabel(item.type)}</span>
                <span className="text-muted-foreground">
                  {standupStrings.carryForward.itemTypeLabel(item.type)}
                </span>
                {item.memberName && (
                  <span className="text-xs text-muted-foreground">{item.memberName}</span>
                )}

                <span
                  data-testid="age-badge"
                  className={
                    item.ageBand === 'chronic'
                      ? 'rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive'
                      : item.ageBand === 'escalated'
                        ? 'rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-200'
                        : 'rounded bg-muted px-1.5 py-0.5 text-xs'
                  }
                >
                  {standupStrings.carryForward.ageBadge({ age: item.ageInStandups })}
                  {item.ageBand === 'chronic'
                    ? ` · ${standupStrings.carryForward.chronicBadge()}`
                    : item.ageBand === 'escalated'
                      ? ` · ${standupStrings.carryForward.escalatedBadge()}`
                      : ''}
                </span>

                {resolved && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{item.status}</span>
                )}
              </div>

              {/* CFW-5's note thread. Never collapsed. */}
              {item.notes.length > 0 && (
                <div
                  data-testid="note-history"
                  className="flex flex-col gap-1 rounded-md bg-muted/50 p-2 text-xs"
                >
                  <p className="font-medium text-muted-foreground">
                    {standupStrings.carryForward.noteHistory()}
                  </p>
                  {item.notes.map((note, index) => (
                    <p key={index}>
                      <span className="text-muted-foreground">{note.standupDate}</span>
                      {note.authorName ? ` — ${note.authorName}: ` : ': '}
                      {note.text}
                    </p>
                  ))}
                </div>
              )}

              {!resolved && (
                <>
                  {item.requiresNoteToday && !item.notedToday && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {standupStrings.carryForward.noteRequired()}
                    </p>
                  )}

                  <div className="flex flex-wrap items-start gap-2">
                    <label className="sr-only" htmlFor={`note-${item.itemId}`}>
                      {standupStrings.carryForward.notePlaceholder()}
                    </label>
                    <textarea
                      id={`note-${item.itemId}`}
                      data-testid="note-input"
                      value={draftText[item.itemId] ?? ''}
                      onChange={(event) =>
                        setDraftText((current) => ({
                          ...current,
                          [item.itemId]: event.target.value
                        }))
                      }
                      placeholder={standupStrings.carryForward.notePlaceholder()}
                      disabled={disabled}
                      className="min-h-14 w-full max-w-sm rounded-md border border-border bg-background px-2 py-1 text-sm sm:w-auto"
                    />
                    <button
                      type="button"
                      data-testid="add-note"
                      disabled={disabled || !(draftText[item.itemId] ?? '').trim()}
                      onClick={() => void submitNote(item)}
                      className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50"
                    >
                      {standupStrings.carryForward.addNote()}
                    </button>
                  </div>

                  {errors[item.itemId] && (
                    <p role="alert" className="text-xs text-destructive">
                      {errors[item.itemId]}
                    </p>
                  )}

                  {item.validResolutions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {item.validResolutions.map((resolutionType) => (
                        <button
                          key={resolutionType}
                          type="button"
                          disabled={disabled}
                          onClick={() => void resolve(item, resolutionType)}
                          className="rounded-md border border-border px-2 py-1 text-xs"
                        >
                          {resolutionLabel(resolutionType)}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function resolutionLabel(resolutionType: string): string {
  switch (resolutionType) {
    case 'done':
      return standupStrings.carryForward.resolveDone()
    case 'reassigned':
      return standupStrings.carryForward.resolveReassigned()
    case 'descoped':
      return standupStrings.carryForward.resolveDescoped()
    case 'acknowledged':
      return standupStrings.carryForward.resolveAcknowledged()
    default:
      return standupStrings.carryForward.resolveOther()
  }
}
