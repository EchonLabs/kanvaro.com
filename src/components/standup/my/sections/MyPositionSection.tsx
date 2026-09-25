'use client'

import { ArrowUpRight, Clock } from 'lucide-react'
import { JourneyEyebrow, JourneyNote, JourneyStep } from '../shared/JourneyStep'
import { TaskTitle } from '../shared/TaskTitle'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'
import type { CarryForwardItemView, CarryForwardPanelView } from '@/lib/standup/carry-forward-service'

export interface MyPositionSectionProps {
  memberId: string
  carryForward?: CarryForwardPanelView
  locale?: string
}

type AgeBand = CarryForwardItemView['ageBand']

/** Border, label colour and age-badge wash per CFW-3 age band. */
const BAND_STYLE: Record<AgeBand, { border: string; text: string; badge: string }> = {
  normal: {
    border: 'border-[var(--my-border)]',
    text: 'text-[var(--my-muted)]',
    badge: 'bg-[var(--my-raised)] text-[var(--my-muted)]'
  },
  note_required: {
    border: 'border-[var(--my-amber)]',
    text: 'text-[var(--my-amber)]',
    badge: 'bg-[var(--my-amber-tint)] text-[var(--my-amber)]'
  },
  escalated: {
    border: 'border-[var(--my-red)]',
    text: 'text-[var(--my-red)]',
    badge: 'bg-[var(--my-red-tint)] text-[var(--my-red)]'
  },
  chronic: {
    border: 'border-[var(--my-red)]',
    text: 'text-[var(--my-red)]',
    badge: 'bg-[var(--my-red-tint)] text-[var(--my-red)]'
  }
}

const STEP = {
  step: 3,
  title: standupStrings.my.positionHeader(),
  subtitle: standupStrings.my.positionStepSubtitle()
}

function formatOriginDate(isoDate: string, locale?: string): string {
  // A calendar date, not an instant — pin to UTC so it never slides a day.
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  })
}

/**
 * Journey step 3 — carry-forward items owned by this member, oldest (most
 * escalated) first. Members cannot add notes here (§3.2 gives that to PMs);
 * this is informational.
 */
export function MyPositionSection({ memberId, carryForward, locale }: MyPositionSectionProps) {
  if (!carryForward) {
    return (
      <JourneyStep {...STEP}>
        <JourneyNote>{standupStrings.my.sectionLoadFailed()}</JourneyNote>
      </JourneyStep>
    )
  }

  const mine = carryForward.items
    .filter((item) => item.memberId === memberId)
    .sort((a, b) => b.ageInStandups - a.ageInStandups)

  if (mine.length === 0) {
    return (
      <JourneyStep {...STEP} state={{ label: standupStrings.my.stateAllClear(), tone: 'green' }}>
        <JourneyNote>{standupStrings.my.positionEmpty()}</JourneyNote>
      </JourneyStep>
    )
  }

  return (
    <JourneyStep {...STEP} state={{ label: standupStrings.my.stateReview(), tone: 'neutral' }}>
      <div className="flex w-full flex-col gap-3">
        <JourneyEyebrow>{standupStrings.my.positionEyebrow()}</JourneyEyebrow>
        <ul className="flex flex-col gap-3">
          {mine.map((item) => {
            const style = BAND_STYLE[item.ageBand] ?? BAND_STYLE.normal
            const raised = item.ageBand === 'escalated' || item.ageBand === 'chronic'
            const latestNote = item.notes.length > 0 ? item.notes[item.notes.length - 1].text : undefined
            const body = [
              standupStrings.my.originallyPlanned({ date: formatOriginDate(item.originDate, locale) }),
              latestNote,
              item.requiresNoteToday && !item.notedToday ? standupStrings.my.pmOwesNote() : undefined
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <li
                key={item.itemId}
                className={cn('flex flex-col gap-2.5 rounded-lg border bg-[var(--my-canvas)] p-4', style.border)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cn('flex items-center gap-1.5 text-[12px] font-semibold', style.text)}>
                    {raised ? (
                      <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                    ) : (
                      <Clock className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                    )}
                    {standupStrings.my.ageBand[item.ageBand] ?? item.ageBand}
                  </span>
                  <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', style.badge)}>
                    {standupStrings.my.ageBadge({ count: item.ageInStandups })}
                  </span>
                </div>
                <TaskTitle
                  taskKey={item.taskKey ?? item.taskId}
                  title={item.taskTitle}
                  className="whitespace-normal font-semibold"
                />
                <p className="text-[12px] leading-4 text-[var(--my-muted)]">{body}</p>
              </li>
            )
          })}
        </ul>
      </div>
    </JourneyStep>
  )
}
