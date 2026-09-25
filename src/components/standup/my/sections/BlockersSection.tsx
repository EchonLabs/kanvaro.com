'use client'

import { useState } from 'react'
import { XCircle } from 'lucide-react'
import { JourneyEyebrow, JourneyNote, JourneyStep } from '../shared/JourneyStep'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'
import type { RaiseBlockerSubmitInput } from '@/components/standup/run/RaiseBlockerModal'
import type { BlockerPanelRow } from '@/lib/standup/blocker-service'

export interface BlockersSectionProps {
  memberId: string
  blockers?: BlockerPanelRow[]
  onRaise: (input: RaiseBlockerSubmitInput) => void
  locale?: string
}

/** RUN-14's floor, the same one `RaiseBlockerModal` enforces. */
const MIN_DESCRIPTION_LENGTH = 10

const STEP = {
  step: 4,
  title: standupStrings.my.blockersStepTitle(),
  subtitle: standupStrings.my.blockersStepSubtitle()
}

function formatTarget(isoDate: string, locale?: string): string {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  })
}

/**
 * Journey step 4 — blockers this member raised (RUN-18: overdue first), and an
 * inline form to raise another. The form files a general blocker; "Mark as
 * Urgent" raises its severity from medium to critical.
 */
export function BlockersSection({ memberId, blockers, onRaise, locale }: BlockersSectionProps) {
  const [description, setDescription] = useState('')
  const [urgent, setUrgent] = useState(false)

  const canSubmit = description.trim().length >= MIN_DESCRIPTION_LENGTH

  const submit = () => {
    if (!canSubmit) return
    onRaise({
      description: description.trim(),
      blockerType: 'other',
      severity: urgent ? 'critical' : 'medium'
    })
    setDescription('')
    setUrgent(false)
  }

  const mine = (blockers ?? [])
    .filter((row) => row.raisedById === memberId)
    .sort((a, b) => (a.overdue === b.overdue ? 0 : a.overdue ? -1 : 1))
  const anyOverdue = mine.some((row) => row.overdue)

  return (
    <JourneyStep
      {...STEP}
      state={
        anyOverdue
          ? { label: standupStrings.my.stateOverdue(), tone: 'red' }
          : { label: standupStrings.my.stateOptional(), tone: 'neutral' }
      }
    >
      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-col gap-2">
          <JourneyEyebrow>{standupStrings.my.activeRoadblocks()}</JourneyEyebrow>
          {!blockers ? (
            <JourneyNote>{standupStrings.my.sectionLoadFailed()}</JourneyNote>
          ) : mine.length === 0 ? (
            <JourneyNote>{standupStrings.my.blockersEmpty()}</JourneyNote>
          ) : (
            <ul className="flex flex-col gap-2">
              {mine.map((row) => {
                const meta = [
                  row.owner ? standupStrings.my.ownedBy({ owner: row.owner }) : standupStrings.my.noOwnerYet(),
                  row.taskKey,
                  row.targetResolutionDate
                    ? standupStrings.my.targetDate({ date: formatTarget(row.targetResolutionDate, locale) })
                    : undefined
                ]
                  .filter(Boolean)
                  .join(' • ')
                return (
                  <li
                    key={row.blockerId}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border bg-[var(--my-canvas)] p-3',
                      row.overdue ? 'border-[var(--my-red)]' : 'border-[var(--my-border)]'
                    )}
                  >
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--my-red)]" strokeWidth={2} aria-hidden />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="text-[14px] font-medium text-[var(--my-text)]">{row.description}</p>
                      <p className="text-[12px] text-[var(--my-muted)]">
                        {meta}
                        {row.overdue ? (
                          <span className="font-semibold text-[var(--my-red)]">
                            {' • '}
                            {standupStrings.my.stateOverdue()}
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <hr className="border-[var(--my-border)]" />

        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <label htmlFor="my-standup-roadblock" className="text-[13px] font-semibold text-[var(--my-text)]">
            {standupStrings.my.raiseRoadblock()}
          </label>
          <textarea
            id="my-standup-roadblock"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={standupStrings.my.roadblockPlaceholder()}
            className="w-full resize-y rounded-md border border-[var(--my-border)] bg-[var(--my-canvas)] p-3 text-[13px] text-[var(--my-text)] placeholder:text-[var(--my-subtle)] focus:border-[var(--my-blue)] focus:outline-none"
          />
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={urgent}
              onClick={() => setUrgent((prev) => !prev)}
              className="flex items-center gap-1.5 text-[12px] text-[var(--my-muted)] hover:text-[var(--my-text)]"
            >
              <span
                aria-hidden
                className={cn(
                  'h-2 w-2 rounded-full',
                  urgent ? 'bg-[var(--my-red)]' : 'border border-[var(--my-subtle)]'
                )}
              />
              {standupStrings.my.markUrgent()}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-md border border-[var(--my-red)] bg-[var(--my-red-tint)] px-3 py-2 text-[12px] font-semibold text-[var(--my-red)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {standupStrings.my.fileRoadblock()}
            </button>
          </div>
        </form>
      </div>
    </JourneyStep>
  )
}
