'use client'

/**
 * "How did planning poker go?" (spec §15.6/§17.4, PLN-11/PLN-12).
 *
 * There was no way to see this after the fact: `finalize`'s own response
 * (`finalValue`, `consensusReached`, `voteSpread`) was computed then thrown
 * away by the modal, and `PlanningWorkspace.refresh()` immediately dropped
 * the completed session by filtering for `status === 'open'`. This reads the
 * numbers the session document already persisted per task (`queue[].finalValue`
 * etc.) and lets the facilitator expand any task to pull its per-voter
 * breakdown from `reveal-state`, which stays queryable after finalize.
 */
import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { cn } from '@/lib/utils'

export interface PokerResultsQueueEntry {
  taskId: string
  key?: string
  title: string
  status: string
  finalValue?: number | null
  consensusReached?: boolean
  voteSpread?: number | null
}

interface VoteDetail {
  voterId: string | null
  voterName: string | null
  card: string | number
  value: number | null
  isOutlier: boolean
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId: string
  estimationUnit: 'story_points' | 'hours'
  queue: PokerResultsQueueEntry[]
}

export function PokerResultsModal({ open, onOpenChange, sessionId, estimationUnit, queue }: Props) {
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [votesByTask, setVotesByTask] = useState<Record<string, VoteDetail[]>>({})
  const [loadingTaskId, setLoadingTaskId] = useState<string | null>(null)

  const estimated = queue.filter((entry) => entry.status === 'estimated')
  const unit = estimationUnit === 'hours' ? 'h' : ' pts'

  const toggle = async (taskId: string) => {
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null)
      return
    }
    setExpandedTaskId(taskId)
    if (votesByTask[taskId]) return

    setLoadingTaskId(taskId)
    try {
      const response = await fetch(`/api/poker-sessions/${sessionId}/tasks/${taskId}/reveal-state`)
      const payload = await response.json()
      if (response.ok && payload.data?.revealed) {
        setVotesByTask((prev) => ({ ...prev, [taskId]: payload.data.votes ?? [] }))
      }
    } catch {
      /* The summary numbers already shown are the important part; a failed
         per-vote fetch just leaves that row collapsed. */
    } finally {
      setLoadingTaskId(null)
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Planning poker results"
      description={
        estimated.length > 0
          ? `${estimated.length} task${estimated.length === 1 ? '' : 's'} estimated`
          : 'No task in this round was finalized.'
      }
    >
      <div className="max-h-[60vh] space-y-2 overflow-y-auto">
        {estimated.map((entry) => {
          const isExpanded = expandedTaskId === entry.taskId
          const votes = votesByTask[entry.taskId]

          return (
            <div
              key={entry.taskId}
              className="rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)]"
            >
              <button
                type="button"
                onClick={() => toggle(entry.taskId)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--apple-tertiary-label)]" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--apple-tertiary-label)]" />
                  )}
                  <span className="min-w-0 truncate text-[13px] font-medium text-[var(--apple-label)]">
                    {entry.key ? `${entry.key} — ${entry.title}` : entry.title}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {entry.consensusReached ? (
                    <Badge variant="outline" className="text-[10px] text-[var(--apple-system-green)]">
                      consensus
                    </Badge>
                  ) : (
                    entry.voteSpread != null && (
                      <Badge variant="outline" className="text-[10px] text-[var(--apple-system-orange)]">
                        spread {entry.voteSpread}
                      </Badge>
                    )
                  )}
                  <span className="font-apple-mono text-[13px] tabular-nums text-[var(--apple-label)]">
                    {entry.finalValue}
                    {unit}
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-[var(--apple-separator)] px-3 py-2.5">
                  {loadingTaskId === entry.taskId ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[var(--apple-tertiary-label)]" />
                  ) : votes && votes.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {votes.map((vote, index) => (
                        <div
                          key={`${vote.voterId ?? 'anon'}-${index}`}
                          className={cn(
                            'rounded-[var(--apple-radius-sm)] border px-2.5 py-1.5 text-[13px]',
                            vote.isOutlier
                              ? 'border-[var(--apple-system-orange)] bg-[var(--apple-system-orange)]/10'
                              : 'border-[var(--apple-separator)]'
                          )}
                        >
                          <span className="font-apple-mono">{vote.card}</span>
                          {vote.voterName && (
                            <span className="ml-2 text-[var(--apple-secondary-label)]">
                              {vote.voterName}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] text-[var(--apple-tertiary-label)]">
                      No per-vote breakdown is available for this task.
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </ResponsiveDialog>
  )
}
