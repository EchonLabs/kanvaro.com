'use client'

/**
 * "How did planning poker go?" (spec §15.6/§17.4, PLN-11/PLN-12).
 *
 * There was no way to see this after the fact: `finalize`'s own response
 * (`finalValue`, `consensusReached`, `voteSpread`) was computed then thrown
 * away by the modal, and `PlanningWorkspace.refresh()` immediately dropped
 * the completed session by filtering for `status === 'open'`.
 *
 * Everything on screen comes from one `/results` request. The per-task columns
 * the design asks for — how many of the round's voters cast, and the
 * min/median/max behind the final number — are not on the session document, so
 * a table built from the session alone could only fill them in a row at a time
 * as rows were expanded.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Download, Loader2 } from 'lucide-react'

import { PlanAvatar, PlanButton } from '@/components/standup/planning/ui'
import { PokerBadge, PokerDialogShell, pokerPanelClass } from '@/components/standup/poker/ui'
import { useNotify } from '@/lib/notify'
import { describeAgreement, type DeckType } from '@/lib/standup/poker'
import { cn } from '@/lib/utils'

interface ResultVote {
  voterId: string | null
  voterName: string | null
  firstName?: string
  lastName?: string
  email?: string
  avatar?: string
  card: string | number
  value: number | null
  isOutlier: boolean
}

interface ResultTask {
  taskId: string
  title: string
  displayId?: string
  status: string
  roundCount: number
  finalValue: number | null
  consensusReached: boolean
  voteSpread: number | null
  min: number | null
  max: number | null
  median: number | null
  votedCount: number
  votes: ResultVote[]
}

interface ResultsPayload {
  estimationUnit: 'story_points' | 'hours'
  pointsToHours: number
  participantCount: number
  /** Needed to read a spread in cards rather than in arithmetic. */
  deckType?: DeckType
  tasks: ResultTask[]
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId: string
  /** Named in the footer, so it is obvious where the estimates landed. */
  sprintName?: string
  /** Completion time of the round, for the header subtitle. */
  completedAt?: string | null
}

export function PokerResultsModal({
  open,
  onOpenChange,
  sessionId,
  sprintName,
  completedAt
}: Props) {
  const notify = useNotify()
  const [data, setData] = useState<ResultsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setLoading(true)

    fetch(`/api/poker-sessions/${sessionId}/results`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('failed'))))
      .then((payload) => {
        if (cancelled) return
        setData(payload.data)
        // The first task opens by default: an entirely collapsed table gives
        // no clue that the rows expand at all.
        setExpandedTaskId(payload.data?.tasks?.[0]?.taskId ?? null)
      })
      .catch(() => {
        if (!cancelled) notify.error({ title: 'Could not load the poker results' })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, sessionId, notify])

  const unit = data?.estimationUnit === 'hours' ? 'h' : ' pts'
  const toHours = useCallback(
    (value: number) =>
      data?.estimationUnit === 'story_points' ? value * (data?.pointsToHours ?? 0) : value,
    [data?.estimationUnit, data?.pointsToHours]
  )

  const estimated = useMemo(
    () => (data?.tasks ?? []).filter((task) => task.finalValue != null),
    [data?.tasks]
  )

  const totals = useMemo(() => {
    const points = estimated.reduce((sum, task) => sum + (task.finalValue ?? 0), 0)
    return {
      points,
      hours: toHours(points),
      consensus: estimated.filter((task) => task.consensusReached).length,
      spread: estimated.filter((task) => !task.consensusReached).length
    }
  }, [estimated, toHours])

  const exportCsv = () => {
    const rows = [
      ['Task', 'Title', 'Voters', 'Outcome', 'Final estimate', 'Converted hours', 'Min', 'Median', 'Max'],
      ...estimated.map((task) => [
        task.displayId ?? '',
        task.title,
        `${task.votedCount} of ${data?.participantCount ?? task.votedCount}`,
        task.consensusReached ? 'Consensus' : 'Spread',
        String(task.finalValue ?? ''),
        String(toHours(task.finalValue ?? 0)),
        String(task.min ?? ''),
        String(task.median ?? ''),
        String(task.max ?? '')
      ])
    ]

    // Quotes doubled, whole field quoted: a task title with a comma or a
    // newline in it must not shift every later column by one.
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n')

    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `planning-poker-${sessionId}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const completedLabel = completedAt
    ? `Completed ${new Date(completedAt).toLocaleString()}`
    : 'Round complete'

  return (
    <PokerDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Planning poker results"
      badge={
        <PokerBadge tone="accent">
          {estimated.length} estimated
        </PokerBadge>
      }
      description={[sprintName, completedLabel].filter(Boolean).join(' · ')}
      footer={
        <>
          <span className="apple-type-footnote text-[var(--plan-muted)]">
            {sprintName
              ? `All estimates are saved to ${sprintName}.`
              : 'All estimates are saved to the sprint.'}
          </span>
          <div className="flex shrink-0 items-center gap-2.5">
            <PlanButton onClick={exportCsv} disabled={estimated.length === 0}>
              <Download />
              Export results
            </PlanButton>
            <PlanButton tone="primary" onClick={() => onOpenChange(false)}>
              Done
            </PlanButton>
          </div>
        </>
      }
    >
      {/* Summary band — the three numbers a PM reads before any single row. */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-10 gap-y-4 border-b border-[var(--plan-border)] bg-[var(--plan-raised)] px-5 py-4 sm:px-7">
        <SummaryItem label="Total estimate" value={`${totals.points}${unit}`} />
        <SummaryItem
          label="Converted time"
          value={`≈ ${totals.hours.toFixed(1).replace(/\.0$/, '')} hours`}
        />
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="apple-type-caption font-semibold uppercase tracking-[0.06em] text-[var(--plan-muted)]">
            Alignment
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <PokerBadge tone="success">{totals.consensus} consensus</PokerBadge>
            {totals.spread > 0 && <PokerBadge tone="warning">{totals.spread} spread</PokerBadge>}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[var(--plan-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="apple-type-subheadline">Loading results…</span>
          </div>
        ) : estimated.length === 0 ? (
          <p className="apple-type-subheadline py-16 text-center text-[var(--plan-muted)]">
            No task in this round was estimated.
          </p>
        ) : (
          <>
            <div className="hidden items-center gap-4 px-4 py-2.5 sm:flex">
              <span className="w-[15px] shrink-0" />
              <span className="apple-type-caption min-w-0 flex-1 font-semibold uppercase tracking-[0.06em] text-[var(--plan-muted)]">
                Task
              </span>
              <span className="apple-type-caption w-[92px] shrink-0 font-semibold uppercase tracking-[0.06em] text-[var(--plan-muted)]">
                Voters
              </span>
              <span className="apple-type-caption w-[132px] shrink-0 font-semibold uppercase tracking-[0.06em] text-[var(--plan-muted)]">
                Outcome
              </span>
              <span className="apple-type-caption w-[124px] shrink-0 text-right font-semibold uppercase tracking-[0.06em] text-[var(--plan-muted)]">
                Final estimate
              </span>
            </div>

            <ul className="flex flex-col">
              {estimated.map((task) => (
                <ResultRow
                  key={task.taskId}
                  task={task}
                  unit={unit}
                  participantCount={data?.participantCount ?? task.votedCount}
                  deckType={data?.deckType ?? 'fibonacci'}
                  expanded={expandedTaskId === task.taskId}
                  onToggle={() =>
                    setExpandedTaskId((current) => (current === task.taskId ? null : task.taskId))
                  }
                  toHours={toHours}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </PokerDialogShell>
  )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="apple-type-caption font-semibold uppercase tracking-[0.06em] text-[var(--plan-muted)]">
        {label}
      </span>
      <span className="apple-type-title3 font-bold tabular-nums text-[var(--plan-text)]">
        {value}
      </span>
    </div>
  )
}

function ResultRow({
  task,
  unit,
  participantCount,
  deckType,
  expanded,
  onToggle,
  toHours
}: {
  task: ResultTask
  unit: string
  participantCount: number
  deckType: DeckType
  expanded: boolean
  onToggle: () => void
  toHours: (value: number) => number
}) {
  // The same reading the reveal screen shows, from the same rule — these two
  // screens used to disagree about the same round because each had its own
  // threshold on `max - min`.
  const agreement = describeAgreement(deckType, {
    min: task.min,
    max: task.max,
    numericCount: task.votes.filter((vote) => vote.value !== null).length
  })

  return (
    <li
      className={cn(
        'flex flex-col',
        expanded
          ? 'my-1 rounded-[var(--apple-radius-lg)] border border-[var(--plan-accent)] bg-[var(--plan-raised)]'
          : 'border-b border-[var(--plan-border)]'
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="apple-transition flex w-full items-center gap-4 rounded-[var(--apple-radius-lg)] px-4 py-3 text-left hover:bg-[var(--plan-raised)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--plan-accent)]"
      >
        {expanded ? (
          <ChevronDown className="h-[15px] w-[15px] shrink-0 text-[var(--plan-accent)]" />
        ) : (
          <ChevronRight className="h-[15px] w-[15px] shrink-0 text-[var(--plan-muted)]" />
        )}

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {task.displayId && (
            <span
              className={cn(
                'apple-type-caption font-semibold tabular-nums',
                expanded ? 'text-[var(--plan-accent)]' : 'text-[var(--plan-muted)]'
              )}
            >
              {task.displayId}
            </span>
          )}
          <span className="apple-type-subheadline truncate font-medium text-[var(--plan-text)]">
            {task.title}
          </span>
        </span>

        <span className="apple-type-footnote hidden w-[92px] shrink-0 tabular-nums text-[var(--plan-muted)] sm:block">
          {task.votedCount} of {participantCount}
        </span>

        <span className="hidden w-[132px] shrink-0 sm:block">
          <PokerBadge tone={agreement.tone}>{agreement.label}</PokerBadge>
        </span>

        <span className="flex w-[124px] shrink-0 items-center justify-end gap-2.5">
          <span className="flex h-[34px] min-w-[34px] items-center justify-center rounded-[var(--apple-radius-sm)] border border-[var(--plan-accent)] bg-[var(--plan-info-bg)] px-2 font-bold tabular-nums text-[var(--plan-accent)]">
            {task.finalValue}
          </span>
          <span className="apple-type-footnote tabular-nums text-[var(--plan-muted)]">
            ≈ {toHours(task.finalValue ?? 0).toFixed(1).replace(/\.0$/, '')}h
          </span>
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-[var(--plan-border)] bg-[var(--plan-surface)] px-4 pb-4 pt-3 sm:pl-[46px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="apple-type-footnote font-semibold text-[var(--plan-text)]">
              Per-voter breakdown
            </span>
            <span className="apple-type-caption tabular-nums text-[var(--plan-muted)]">
              MIN {task.min ?? '—'} · MEDIAN {task.median ?? '—'} · MAX {task.max ?? '—'}
              {task.roundCount > 1 && ` · ROUND ${task.roundCount}`}
            </span>
          </div>

          {task.votes.length === 0 ? (
            <p className="apple-type-footnote text-[var(--plan-muted)]">
              No votes were recorded for this task.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {task.votes.map((vote, index) => (
                <div
                  key={`${vote.voterId ?? 'anon'}-${index}`}
                  className={cn(
                    'flex flex-col gap-2 rounded-[var(--apple-radius-sm)] border p-2.5',
                    vote.isOutlier
                      ? 'border-[var(--plan-danger)] bg-[var(--plan-danger-bg)]'
                      : 'border-[var(--plan-border)] bg-[var(--plan-raised)]'
                  )}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <PlanAvatar
                      member={{
                        name: vote.voterName ?? 'Anonymous',
                        firstName: vote.firstName,
                        lastName: vote.lastName,
                        email: vote.email,
                        avatar: vote.avatar
                      }}
                      size={30}
                    />
                    <span className="apple-type-caption min-w-0 flex-1 truncate text-[var(--plan-text)]">
                      {vote.voterName ?? 'Anonymous'}
                    </span>
                  </div>
                  <div
                    className={cn(
                      'flex items-center justify-between gap-1',
                      vote.isOutlier ? 'text-[var(--plan-danger)]' : 'text-[var(--plan-text)]'
                    )}
                  >
                    <span className="apple-type-callout font-bold tabular-nums">{vote.card}</span>
                    {vote.isOutlier && (
                      <span className="text-[9px] font-bold uppercase tracking-[0.06em]">
                        Outlier
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  )
}
