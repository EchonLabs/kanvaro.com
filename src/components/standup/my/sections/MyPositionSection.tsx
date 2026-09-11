'use client'

import { AlertTriangle, Clock, MapPin, MessageSquare } from 'lucide-react'
import { IconChip, type IconChipTone } from '../shared/IconChip'
import { SectionCard } from '../shared/SectionCard'
import { StatusPill } from '../shared/StatusPill'
import { standupStrings } from '@/lib/standup/strings'
import type { CarryForwardPanelView } from '@/lib/standup/carry-forward-service'

export interface MyPositionSectionProps {
  memberId: string
  carryForward?: CarryForwardPanelView
  locale?: string
}

const AGE_BAND_TONE: Record<string, IconChipTone> = {
  normal: 'neutral',
  note_required: 'orange',
  escalated: 'red',
  chronic: 'red'
}

const AGE_BAND_ICON: Record<string, React.ReactNode> = {
  normal: <Clock strokeWidth={1.75} />,
  note_required: <MessageSquare strokeWidth={1.75} />,
  escalated: <AlertTriangle strokeWidth={1.75} />,
  chronic: <AlertTriangle strokeWidth={1.75} />
}

/** Design §4.6 — carry-forward items owned by this member, oldest (most escalated) first. Members cannot add notes here (§3.2 gives that to PMs); this is informational. */
export function MyPositionSection({ memberId, carryForward }: MyPositionSectionProps) {
  if (!carryForward) {
    return (
      <SectionCard title={standupStrings.my.positionHeader()} icon={<MapPin strokeWidth={1.75} />}>
        <p className="text-[15px] text-[var(--apple-secondary-label)]">
          {standupStrings.my.sectionLoadFailed()}
        </p>
      </SectionCard>
    )
  }

  const mine = carryForward.items
    .filter((item) => item.memberId === memberId)
    .sort((a, b) => b.ageInStandups - a.ageInStandups)

  return (
    <SectionCard
      title={standupStrings.my.positionHeader()}
      icon={<MapPin strokeWidth={1.75} />}
      summary={mine.length > 0 ? standupStrings.my.positionCount({ count: mine.length }) : undefined}
    >
      {mine.length === 0 ? (
        <p className="text-[15px] text-[var(--apple-secondary-label)]">{standupStrings.my.positionEmpty()}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {mine.map((item) => {
            const tone = AGE_BAND_TONE[item.ageBand] ?? 'neutral'
            return (
              <li
                key={item.itemId}
                className="flex items-start gap-3 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-card p-3"
              >
                <IconChip icon={AGE_BAND_ICON[item.ageBand] ?? AGE_BAND_ICON.normal} tone={tone} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-apple-mono text-[13px] text-[var(--apple-label)]">
                      {item.taskKey ?? item.taskId}
                    </span>
                    <StatusPill tone={tone}>
                      {standupStrings.my.carriedAge({ count: item.ageInStandups })}
                    </StatusPill>
                  </div>
                  {item.requiresNoteToday ? (
                    <p className="text-[13px] text-[var(--apple-secondary-label)]">
                      {standupStrings.my.pmOwesNote()}
                    </p>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
}
