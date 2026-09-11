'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { SectionCard } from '../shared/SectionCard'
import { StatusPill } from '../shared/StatusPill'
import { standupStrings } from '@/lib/standup/strings'
import {
  RaiseBlockerModal,
  type RaiseBlockerSubmitInput,
  type RaiseBlockerTaskOption
} from '@/components/standup/run/RaiseBlockerModal'
import type { BlockerPanelRow } from '@/lib/standup/blocker-service'
import type { BoardAllocationView } from '@/components/standup/run/CapacityBoard'

export interface BlockersSectionProps {
  memberId: string
  blockers?: BlockerPanelRow[]
  allocations: readonly BoardAllocationView[]
  onRaise: (input: RaiseBlockerSubmitInput) => void
  locale?: string
}

/** Design §4.7 — blockers this member raised, reusing `RaiseBlockerModal` rather than a second form. RUN-18: overdue sorts first. */
export function BlockersSection({ memberId, blockers, allocations, onRaise }: BlockersSectionProps) {
  const [raising, setRaising] = useState(false)

  const taskOptions: RaiseBlockerTaskOption[] = allocations.map((row) => ({
    taskId: row.taskId,
    key: row.taskKey,
    title: row.title,
    allocationId: row.allocationId
  }))

  if (!blockers) {
    return (
      <SectionCard title={standupStrings.my.blockersHeader()}>
        <p className="text-[15px] text-[var(--apple-secondary-label)]">
          {standupStrings.my.sectionLoadFailed()}
        </p>
      </SectionCard>
    )
  }

  const mine = blockers
    .filter((row) => row.raisedById === memberId)
    .sort((a, b) => (a.overdue === b.overdue ? 0 : a.overdue ? -1 : 1))

  return (
    <SectionCard
      title={standupStrings.my.blockersHeader()}
      summary={
        <Button variant="outline" size="sm" onClick={() => setRaising(true)}>
          {standupStrings.my.reportBlocker()}
        </Button>
      }
    >
      {mine.length === 0 ? (
        <p className="text-[15px] text-[var(--apple-secondary-label)]">{standupStrings.my.blockersEmpty()}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {mine.map((row) => (
            <li
              key={row.blockerId}
              className="flex flex-col gap-1 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-card p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15px] text-[var(--apple-label)]">{row.description}</span>
                {row.overdue ? (
                  <StatusPill tone="red">
                    <AlertTriangle className="mr-1 h-3 w-3" strokeWidth={1.75} />
                    overdue
                  </StatusPill>
                ) : (
                  <StatusPill tone="neutral">{row.status}</StatusPill>
                )}
              </div>
              {row.taskKey ? (
                <span className="font-apple-mono text-[13px] text-[var(--apple-tertiary-label)]">
                  {row.taskKey}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <ResponsiveDialog open={raising} onOpenChange={setRaising} title={standupStrings.blocker.raise()}>
        <RaiseBlockerModal
          tasks={taskOptions}
          onCancel={() => setRaising(false)}
          onSubmit={(input) => {
            onRaise(input)
            setRaising(false)
          }}
        />
      </ResponsiveDialog>
    </SectionCard>
  )
}
