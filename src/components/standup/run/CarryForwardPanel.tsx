'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import {
  PLAN_SCROLL_MAX,
  PlanCard,
  PlanCount,
  planButtonClass,
  planEmptyClass,
  planFieldClass,
  planPillClass,
  type PlanPillTone
} from '../planning/ui'

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
 *
 * Each item is one full-width rounded row: who and what on the left; age,
 * "note due" and the actions on the right; the note thread underneath. The
 * earlier two-column row split identity from the record at a fixed 20rem,
 * which left a narrow column of badges and buttons stacked five deep.
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
  className?: string
}

const OPEN_STATUSES = ['open', 'noted', 'escalated']

export function CarryForwardPanel({
  data,
  api,
  disabled = false,
  className
}: CarryForwardPanelProps) {
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [ageFilter, setAgeFilter] = useState<string>('all')
  const [draftText, setDraftText] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  /**
   * Which calm rows have had their note editor revealed.
   *
   * Only consulted for rows that do NOT owe a note today — one that does gets
   * the editor unconditionally, so this never gates an obligation. Keyed by
   * item id rather than held as a single "expanded row", because a PM working
   * down the register may well open two.
   */
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})

  const types = useMemo(
    () => Array.from(new Set(data.items.map((item) => item.type))),
    [data.items]
  )

  const visible = data.items.filter((item) => {
    if (typeFilter !== 'all' && item.type !== typeFilter) return false
    if (ageFilter !== 'all' && item.ageBand !== ageFilter) return false
    return true
  })

  /**
   * The red heading count: items needing something of the PM today — a note
   * that is owed, or an age band past the escalation line.
   *
   * Counted over `data.items` rather than `visible`, because a filter narrows
   * what is on screen and must not narrow what is outstanding. Counted per item
   * rather than as `summary.needingNoteToday + summary.escalated`, because an
   * item can be both and that sum would report it twice.
   */
  const issues = data.items.filter(
    (item) =>
      (item.requiresNoteToday && !item.notedToday) ||
      item.ageBand === 'escalated' ||
      item.ageBand === 'chronic'
  ).length

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
    <PlanCard
      id="panel-4"
      aria-labelledby="panel-4-heading"
      title={standupStrings.carryForward.title()}
      headingLevel="h3"
      headingId="panel-4-heading"
      className={className}
      aside={
        <PlanCount
          count={issues}
          label={standupStrings.carryForward.issueCount({ count: issues })}
        />
      }
    >
      {/* CFW-11's summary as one quiet line, and CFW-10's filters at the far
          end of it. The summary used to be four pills (zeros included) beside
          two labelled selects and a "sorted oldest first" caption — seven
          things to read before the first item. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p
          data-testid="carry-forward-summary"
          className="apple-type-subheadline text-[var(--plan-muted)]"
        >
          <span className="font-semibold text-[var(--plan-text)]">
            {standupStrings.carryForward.summaryOpen({ count: data.summary.totalOpen })}
          </span>
          {data.summary.needingNoteToday > 0 && (
            <>
              {' · '}
              <span className="font-semibold text-[var(--plan-warning)]">
                {standupStrings.carryForward.summaryNeedingNote({
                  count: data.summary.needingNoteToday
                })}
              </span>
            </>
          )}
          {data.summary.escalated > 0 && (
            <>
              {' · '}
              <span className="font-semibold text-[var(--plan-danger)]">
                {standupStrings.carryForward.summaryEscalated({ count: data.summary.escalated })}
              </span>
            </>
          )}
          {data.summary.resolvedYesterday > 0 && (
            <>
              {' · '}
              {standupStrings.carryForward.summaryResolved({ count: data.summary.resolvedYesterday })}
            </>
          )}
        </p>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            aria-label={standupStrings.carryForward.filterType()}
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className={cn(planFieldClass, 'rounded-[var(--apple-radius-pill)] px-3')}
          >
            <option value="all">{standupStrings.carryForward.allTypes()}</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {standupStrings.carryForward.itemTypeLabel(type)}
              </option>
            ))}
          </select>
          <select
            aria-label={standupStrings.carryForward.filterAgeBand()}
            value={ageFilter}
            onChange={(event) => setAgeFilter(event.target.value)}
            className={cn(planFieldClass, 'rounded-[var(--apple-radius-pill)] px-3')}
          >
            <option value="all">{standupStrings.carryForward.allAges()}</option>
            <option value="normal">Normal</option>
            <option value="note_required">Needs a note</option>
            <option value="escalated">Escalated</option>
            <option value="chronic">Chronic</option>
          </select>
        </div>
      </div>

      {visible.length === 0 && (
        <p className={planEmptyClass}>{standupStrings.carryForward.empty()}</p>
      )}

      {/* Full-width rows, oldest first (CFW-10). The register only grows
          across a sprint, so the list scrolls rather than the page. */}
      {visible.length > 0 && (
        <ul className={cn('flex flex-col gap-2.5 p-0.5', `plan-scroll ${PLAN_SCROLL_MAX}`)}>
          {visible.map((item) => {
            const resolved = !OPEN_STATUSES.includes(item.status)
            const typeLabel = standupStrings.carryForward.itemTypeLabel(item.type)
            const owesNote = !resolved && item.requiresNoteToday && !item.notedToday
            const editorOpen = !resolved && (owesNote || revealed[item.itemId])

            return (
              <li
                key={item.itemId}
                data-testid={`carry-forward-item-${item.itemId}`}
                className={cn(
                  'flex flex-col gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--plan-border)] bg-[var(--plan-surface)] p-4 shadow-[var(--plan-shadow)]',
                  /* The age band as a left rule. Reinforcement only — the age
                     badge spells "Escalated"/"Chronic" out in text and an owed
                     note carries its own label, so a reader who cannot
                     distinguish the rule's colour loses nothing. */
                  AGE_RULE[item.ageBand] && cn('border-l-[3px]', AGE_RULE[item.ageBand]),
                  resolved && 'opacity-75'
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                  {/* Who and what. */}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="flex min-w-0 flex-wrap items-center gap-2 apple-type-body font-semibold text-[var(--plan-text)]">
                      {item.taskKey && (
                        <span className={planPillClass('neutral', 'tabular-nums')}>{item.taskKey}</span>
                      )}
                      <span className="min-w-0">{item.taskTitle ?? typeLabel}</span>
                    </p>
                    <p className="apple-type-caption text-[var(--plan-muted)]">
                      {[item.memberName, item.taskKey || item.taskTitle ? typeLabel : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>

                  {/* How urgent, then what can be done about it. */}
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {resolved && (
                      <span className={planPillClass('neutral', 'capitalize')}>{item.status}</span>
                    )}
                    {owesNote && (
                      <span
                        className={planPillClass('warning')}
                        title={standupStrings.carryForward.noteRequired()}
                      >
                        <AlertTriangle className="mr-1 h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
                        {standupStrings.carryForward.noteDue()}
                      </span>
                    )}
                    <span className={planPillClass(AGE_TONE[item.ageBand])} data-testid="age-badge">
                      {standupStrings.carryForward.ageBadge({ age: item.ageInStandups })}
                      {item.ageBand === 'chronic'
                        ? ` · ${standupStrings.carryForward.chronicBadge()}`
                        : item.ageBand === 'escalated'
                          ? ` · ${standupStrings.carryForward.escalatedBadge()}`
                          : ''}
                    </span>

                    {!resolved && !editorOpen && (
                      <button
                        type="button"
                        data-testid="reveal-note"
                        disabled={disabled}
                        onClick={() =>
                          setRevealed((current) => ({ ...current, [item.itemId]: true }))
                        }
                        className={planButtonClass('secondary', 'h-8 px-3', 'sm')}
                      >
                        {standupStrings.carryForward.addNote()}
                      </button>
                    )}

                    {!resolved &&
                      item.validResolutions.map((resolutionType) => (
                        <button
                          key={resolutionType}
                          type="button"
                          disabled={disabled}
                          onClick={() => void resolve(item, resolutionType)}
                          /* `done` is the primary action wherever it is offered.
                             Keyed off the VALUE, not the array position: the
                             server owns that order. */
                          className={planButtonClass(
                            resolutionType === 'done' ? 'primary' : 'secondary',
                            'h-8 px-3',
                            'sm'
                          )}
                        >
                          {resolutionLabel(resolutionType)}
                        </button>
                      ))}
                  </div>
                </div>

                {/* CFW-5's note thread. Never collapsed — spotting the same
                    excuse five days running is the whole point of the
                    register — but compact: one line per note, newest last. */}
                {item.notes.length > 0 && (
                  <ol
                    data-testid="note-history"
                    className="flex flex-col gap-1.5 rounded-[var(--apple-radius-md)] bg-[var(--plan-raised)] px-3 py-2.5 apple-type-caption"
                  >
                    {item.notes.map((note, index) => (
                      <li key={index} className="flex flex-wrap gap-x-2 text-[var(--plan-text)]">
                        <span className="shrink-0 tabular-nums text-[var(--plan-muted)]">
                          {note.standupDate}
                          {note.authorName ? ` · ${note.authorName}` : ''}
                        </span>
                        <span className="min-w-0">{note.text}</span>
                      </li>
                    ))}
                  </ol>
                )}

                {editorOpen && (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`note-${item.itemId}`}>
                      {standupStrings.carryForward.notePlaceholder()}
                    </label>
                    <input
                      id={`note-${item.itemId}`}
                      data-testid="note-input"
                      type="text"
                      value={draftText[item.itemId] ?? ''}
                      onChange={(event) =>
                        setDraftText((current) => ({
                          ...current,
                          [item.itemId]: event.target.value
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && (draftText[item.itemId] ?? '').trim()) {
                          event.preventDefault()
                          void submitNote(item)
                        }
                      }}
                      placeholder={standupStrings.carryForward.notePlaceholder()}
                      disabled={disabled}
                      className={cn(planFieldClass, 'h-9 min-w-[12rem] flex-1 px-3')}
                    />
                    <button
                      type="button"
                      data-testid="add-note"
                      disabled={disabled || !(draftText[item.itemId] ?? '').trim()}
                      onClick={() => void submitNote(item)}
                      className={planButtonClass('primary', 'h-9 px-4', 'sm')}
                    >
                      {standupStrings.carryForward.addNote()}
                    </button>
                  </div>
                )}

                {errors[item.itemId] && (
                  <p role="alert" className="apple-type-caption text-[var(--plan-danger)]">
                    {errors[item.itemId]}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </PlanCard>
  )
}

const AGE_TONE: Record<CarryForwardItemRow['ageBand'], PlanPillTone> = {
  normal: 'neutral',
  note_required: 'warning',
  escalated: 'danger',
  chronic: 'danger'
}

/**
 * The left rule a row carries for its age band.
 *
 * Empty for `normal`, so a calm register stays quiet and the rules that do
 * appear mean something. Never the only signal: `AGE_TONE` tints the badge and
 * `ageBadge` names the band in text beside it.
 */
const AGE_RULE: Record<CarryForwardItemRow['ageBand'], string> = {
  normal: '',
  note_required: 'border-l-[var(--plan-warning)]',
  escalated: 'border-l-[var(--plan-danger)]',
  chronic: 'border-l-[var(--plan-danger)]'
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
