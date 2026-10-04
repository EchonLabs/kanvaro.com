'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import {
  PLAN_SCROLL_MAX,
  PlanCard,
  PlanCount,
  PlanRow,
  planButtonClass,
  planEmptyClass,
  planFieldClass,
  planInsetClass,
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
      description={standupStrings.carryForward.subtitle()}
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

      {/* CFW-11's summary and CFW-10's filters share one wrapping row. They
          were two stacked rows, which cost vertical space in a panel that is
          the tallest on the page by the end of a sprint — and they read as one
          control strip anyway: the pills say what is outstanding, the selects
          narrow to it. */}
      <div className="apple-type-subheadline flex flex-wrap items-center gap-x-3 gap-y-2 text-[var(--plan-muted)]">
        <div className="flex flex-wrap gap-1.5" data-testid="carry-forward-summary">
          <span className={planPillClass('neutral')}>
            {standupStrings.carryForward.summaryOpen({ count: data.summary.totalOpen })}
          </span>
          <span className={planPillClass(data.summary.needingNoteToday > 0 ? 'warning' : 'neutral')}>
            {standupStrings.carryForward.summaryNeedingNote({ count: data.summary.needingNoteToday })}
          </span>
          <span className={planPillClass(data.summary.escalated > 0 ? 'danger' : 'neutral')}>
            {standupStrings.carryForward.summaryEscalated({ count: data.summary.escalated })}
          </span>
          <span className={planPillClass('neutral')}>
            {standupStrings.carryForward.summaryResolved({ count: data.summary.resolvedYesterday })}
          </span>
        </div>

        <span aria-hidden="true" className="hidden h-5 w-px bg-[var(--plan-border)] sm:block" />

        <label className="flex items-center gap-1.5">
          {standupStrings.carryForward.filterType()}
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className={planFieldClass}
          >
            <option value="all">All</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {standupStrings.carryForward.itemTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          {standupStrings.carryForward.filterAgeBand()}
          <select
            value={ageFilter}
            onChange={(event) => setAgeFilter(event.target.value)}
            className={planFieldClass}
          >
            <option value="all">All</option>
            <option value="normal">Normal</option>
            <option value="note_required">Needs a note</option>
            <option value="escalated">Escalated</option>
            <option value="chronic">Chronic</option>
          </select>
        </label>
        <span className="ml-auto self-center">
          {standupStrings.carryForward.sortedByAge()}
        </span>
      </div>

      {visible.length === 0 && (
        <p className={planEmptyClass}>{standupStrings.carryForward.empty()}</p>
      )}

      {/* The register only grows across a sprint — by the final day it is the
          tallest panel on the page — and every row can open a note editor and
          its note thread on top of that. */}
      <ul
        className={cn(
          'flex flex-col divide-y divide-[var(--plan-border)]',
          visible.length > 0 && `plan-scroll ${PLAN_SCROLL_MAX}`
        )}
      >
        {visible.map((item) => {
          const resolved = !OPEN_STATUSES.includes(item.status)
          const typeLabel = standupStrings.carryForward.itemTypeLabel(item.type)
          const meta = [
            item.memberName ? standupStrings.carryForward.ownedBy({ name: item.memberName }) : null,
            item.taskKey || item.taskTitle ? typeLabel : null
          ]
            .filter(Boolean)
            .join(' · ')

          const owesNote = !resolved && item.requiresNoteToday && !item.notedToday

          return (
            <li
              key={item.itemId}
              data-testid={`carry-forward-item-${item.itemId}`}
              className={cn(
                /* Two columns from `lg`: identity and urgency on the left, the
                   record on the right. Stacked, these two groups made every
                   open row about five blocks tall, so a scroll box capped at
                   26rem showed roughly one and a half items by the end of a
                   sprint. Side by side, a row is about as tall as its thread. */
                'grid gap-x-4 gap-y-2 py-3 apple-type-subheadline first:pt-0 last:pb-0',
                'lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]',
                /* The age band as a left rule. Reinforcement only — the age
                   badge spells "Escalated"/"Chronic" out in text and an owed
                   note carries its own icon and sentence, so a reader who
                   cannot distinguish the rule's colour loses nothing. */
                AGE_RULE[item.ageBand] && cn('border-l-2 pl-3', AGE_RULE[item.ageBand])
              )}
            >
              <div className="flex min-w-0 flex-col gap-2">
              {/* The blueprint's row: "Ardeo AI Plans" / "Owned by Marcus T." /
                  "AGE: 4 DAYS", the badge's colour climbing with the age band. */}
              <PlanRow
                title={
                  <>
                    <span>{item.taskKey ?? typeLabel}</span>
                    {item.taskTitle && <span> {item.taskTitle}</span>}
                  </>
                }
                meta={meta || undefined}
                badge={
                  <>
                    {resolved && <span className={planPillClass('neutral', 'capitalize')}>{item.status}</span>}
                    <span className={planPillClass(AGE_TONE[item.ageBand])} data-testid="age-badge">
                      {standupStrings.carryForward.ageBadge({ age: item.ageInStandups })}
                      {item.ageBand === 'chronic'
                        ? ` · ${standupStrings.carryForward.chronicBadge()}`
                        : item.ageBand === 'escalated'
                          ? ` · ${standupStrings.carryForward.escalatedBadge()}`
                          : ''}
                    </span>
                  </>
                }
              />

                {/* The owed-note warning sits with the age badge rather than
                    under the thread: both answer "how urgent is this", and a
                    PM scanning the left column should not have to read past a
                    note history to find out. */}
                {owesNote && (
                  <p className="flex items-center gap-1 apple-type-caption font-semibold text-[var(--plan-warning)]">
                    <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
                    {standupStrings.carryForward.noteRequired()}
                  </p>
                )}

                {!resolved && item.validResolutions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {item.validResolutions.map((resolutionType) => (
                      <button
                        key={resolutionType}
                        type="button"
                        disabled={disabled}
                        onClick={() => void resolve(item, resolutionType)}
                        /* `done` is the primary action wherever it is offered —
                           four equal secondary buttons gave a PM no steer on
                           which one was expected. Keyed off the VALUE, not the
                           array position: the server owns that order. */
                        className={planButtonClass(
                          resolutionType === 'done' ? 'primary' : 'secondary',
                          'h-7 px-2.5',
                          'sm'
                        )}
                      >
                        {resolutionLabel(resolutionType)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* The record: the thread, then the editor. */}
              <div className="flex min-w-0 flex-col gap-2">
              {/* CFW-5's note thread. Never collapsed — not on an urgent row,
                  not on a calm one, not on a resolved one. The editor below
                  may collapse; this may not, because spotting the same excuse
                  five days running is the whole point of the register. */}
              {item.notes.length > 0 && (
                <div
                  data-testid="note-history"
                  className={cn(planInsetClass, 'flex flex-col gap-1 p-2.5 apple-type-caption')}
                >
                  <p className="font-semibold text-[var(--plan-secondary)]">
                    {standupStrings.carryForward.noteHistory()}
                  </p>
                  {item.notes.map((note, index) => (
                    <p key={index} className="text-[var(--plan-text)]">
                      <span className="text-[var(--plan-muted)]">{note.standupDate}</span>
                      {note.authorName ? ` — ${note.authorName}: ` : ': '}
                      {note.text}
                    </p>
                  ))}
                </div>
              )}

              {!resolved && (
                <>
                  {/* A row that owes a note today gets the editor open. A calm
                      one gets a button that reveals it, because a 56px
                      textarea on every row it did not need was the single
                      biggest consumer of height in this panel. The capability
                      is collapsed, never removed — any open item can still be
                      noted. */}
                  {!owesNote && !revealed[item.itemId] && (
                    <button
                      type="button"
                      data-testid="reveal-note"
                      disabled={disabled}
                      onClick={() =>
                        setRevealed((current) => ({ ...current, [item.itemId]: true }))
                      }
                      className={planButtonClass('secondary', 'h-7 self-start px-2.5', 'sm')}
                    >
                      {standupStrings.carryForward.addNote()}
                    </button>
                  )}

                  {(owesNote || revealed[item.itemId]) && (
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
                      className="min-h-14 w-full min-w-[12rem] flex-1 rounded-[var(--apple-radius-sm)] border border-[var(--plan-border)] bg-[var(--plan-surface)] px-2.5 py-1.5 apple-type-subheadline text-[var(--plan-text)] disabled:opacity-40"
                    />
                    <button
                      type="button"
                      data-testid="add-note"
                      disabled={disabled || !(draftText[item.itemId] ?? '').trim()}
                      onClick={() => void submitNote(item)}
                      className={planButtonClass('secondary', 'h-8 shrink-0 px-3')}
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
                </>
              )}
              </div>
            </li>
          )
        })}
      </ul>
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
  note_required: 'border-[var(--plan-warning)]',
  escalated: 'border-[var(--plan-danger)]',
  chronic: 'border-[var(--plan-danger)]'
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
