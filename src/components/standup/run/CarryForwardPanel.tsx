'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import {
  Badge,
  CARD_CLASSES,
  EMPTY_CLASSES,
  INSET_CLASSES,
  IssueCount,
  RowHead,
  RUN_FIELD_CLASSES,
  SCROLL_CLASSES,
  SCROLL_MAX,
  SECONDARY_BUTTON_CLASSES,
  SECTION_SUBTITLE_CLASSES,
  SECTION_TITLE_CLASSES,
  TEXT_BODY,
  TEXT_META,
  type Tone
} from './ui'

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
    <section
      id="panel-4"
      aria-labelledby="panel-4-heading"
      className={cn('scroll-mt-6 flex flex-col gap-4', CARD_CLASSES, className)}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h3 id="panel-4-heading" className={SECTION_TITLE_CLASSES}>
            {standupStrings.carryForward.title()}
          </h3>
          <IssueCount
            count={issues}
            label={standupStrings.carryForward.issueCount({ count: issues })}
          />
        </div>
        <p className={SECTION_SUBTITLE_CLASSES}>{standupStrings.carryForward.subtitle()}</p>
      </div>

      {/* CFW-11's summary strip. */}
      <div className="flex flex-wrap gap-1.5" data-testid="carry-forward-summary">
        <Badge tone="neutral">
          {standupStrings.carryForward.summaryOpen({ count: data.summary.totalOpen })}
        </Badge>
        <Badge tone={data.summary.needingNoteToday > 0 ? 'amber' : 'neutral'}>
          {standupStrings.carryForward.summaryNeedingNote({ count: data.summary.needingNoteToday })}
        </Badge>
        <Badge tone={data.summary.escalated > 0 ? 'red' : 'neutral'}>
          {standupStrings.carryForward.summaryEscalated({ count: data.summary.escalated })}
        </Badge>
        <Badge tone="neutral">
          {standupStrings.carryForward.summaryResolved({ count: data.summary.resolvedYesterday })}
        </Badge>
      </div>

      {/* CFW-10's filters. */}
      <div className={cn(TEXT_BODY, 'flex flex-wrap items-center gap-2 text-[var(--sur-muted)]')}>
        <label className="flex items-center gap-1.5">
          {standupStrings.carryForward.filterType()}
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className={RUN_FIELD_CLASSES}
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
            className={RUN_FIELD_CLASSES}
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
        <p className={EMPTY_CLASSES}>{standupStrings.carryForward.empty()}</p>
      )}

      {/* The register only grows across a sprint — by the final day it is the
          tallest panel on the page — and every row can open a note editor and
          its note thread on top of that. */}
      <ul
        className={cn(
          'flex flex-col divide-y divide-[var(--sur-border)]',
          visible.length > 0 && `${SCROLL_CLASSES} ${SCROLL_MAX}`
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

          return (
            <li
              key={item.itemId}
              data-testid={`carry-forward-item-${item.itemId}`}
              className="flex flex-col gap-2 py-3 text-[13px] first:pt-0 last:pb-0"
            >
              {/* The blueprint's row: "Ardeo AI Plans" / "Owned by Marcus T." /
                  "AGE: 4 DAYS", the badge's colour climbing with the age band. */}
              <RowHead
                title={
                  <>
                    <span>{item.taskKey ?? typeLabel}</span>
                    {item.taskTitle && <span> {item.taskTitle}</span>}
                  </>
                }
                meta={meta || undefined}
                badge={
                  <>
                    {resolved && <Badge tone="neutral">{item.status}</Badge>}
                    <Badge tone={AGE_TONE[item.ageBand]} data-testid="age-badge">
                      {standupStrings.carryForward.ageBadge({ age: item.ageInStandups })}
                      {item.ageBand === 'chronic'
                        ? ` · ${standupStrings.carryForward.chronicBadge()}`
                        : item.ageBand === 'escalated'
                          ? ` · ${standupStrings.carryForward.escalatedBadge()}`
                          : ''}
                    </Badge>
                  </>
                }
              />

              {/* CFW-5's note thread. Never collapsed. */}
              {item.notes.length > 0 && (
                <div
                  data-testid="note-history"
                  className={cn(INSET_CLASSES, 'flex flex-col gap-1 p-2.5 text-[11px]')}
                >
                  <p className="font-semibold text-[var(--sur-secondary)]">
                    {standupStrings.carryForward.noteHistory()}
                  </p>
                  {item.notes.map((note, index) => (
                    <p key={index} className="text-[var(--sur-text)]">
                      <span className="text-[var(--sur-muted)]">{note.standupDate}</span>
                      {note.authorName ? ` — ${note.authorName}: ` : ': '}
                      {note.text}
                    </p>
                  ))}
                </div>
              )}

              {!resolved && (
                <>
                  {item.requiresNoteToday && !item.notedToday && (
                    <p className="flex items-center gap-1 text-[11px] font-semibold text-[var(--sur-amber)]">
                      <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
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
                      className="min-h-14 w-full min-w-[12rem] flex-1 rounded-[var(--sur-radius-control)] border border-[var(--sur-border)] bg-[var(--sur-surface)] px-2.5 py-1.5 text-[13px] text-[var(--sur-text)] disabled:opacity-40"
                    />
                    <button
                      type="button"
                      data-testid="add-note"
                      disabled={disabled || !(draftText[item.itemId] ?? '').trim()}
                      onClick={() => void submitNote(item)}
                      className={cn(SECONDARY_BUTTON_CLASSES, 'h-8 shrink-0 px-3 text-[13px]')}
                    >
                      {standupStrings.carryForward.addNote()}
                    </button>
                  </div>

                  {errors[item.itemId] && (
                    <p role="alert" className="text-[11px] text-[var(--sur-red)]">
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
                          className={cn(SECONDARY_BUTTON_CLASSES, 'h-7 px-2.5 text-[13px]')}
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

const AGE_TONE: Record<CarryForwardItemRow['ageBand'], Tone> = {
  normal: 'neutral',
  note_required: 'amber',
  escalated: 'red',
  chronic: 'red'
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
