'use client'

import { ClipboardCheck, CornerDownRight, Hand, ListChecks, UserCheck, Wand2 } from 'lucide-react'
import { HoursValue } from '../shared/HoursValue'
import { IconChip } from '../shared/IconChip'
import { SectionCard } from '../shared/SectionCard'
import { StatusPill } from '../shared/StatusPill'
import { formatMinutesAsHours, sumMinutes, type Minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import type { BoardAllocationView } from '@/components/standup/run/CapacityBoard'

const SOURCE_LABEL: Record<string, () => string> = {
  carried_forward: standupStrings.my.sourceCarried,
  pre_assigned: standupStrings.my.sourcePreAssigned,
  assigned_in_standup: standupStrings.my.sourceAssignedInStandup,
  self_selected: standupStrings.my.sourceSelfSelected,
  auto_prefilled: standupStrings.my.sourceAutoPrefilled
}

/** A shape per source, not a colour — where a task came from is a fact, not a state of alarm, so every icon stays neutral-toned. */
const SOURCE_ICON: Record<string, React.ReactNode> = {
  carried_forward: <CornerDownRight strokeWidth={1.75} />,
  pre_assigned: <ClipboardCheck strokeWidth={1.75} />,
  assigned_in_standup: <UserCheck strokeWidth={1.75} />,
  self_selected: <Hand strokeWidth={1.75} />,
  auto_prefilled: <Wand2 strokeWidth={1.75} />
}

export interface TodaysPlanSectionProps {
  allocations: readonly BoardAllocationView[]
  readOnly: boolean
  onChangeHours: (allocationId: string, plannedMinutes: Minutes) => void
  locale?: string
}

/** Design §4.5 — Today's plan upgraded with a live total (R1), each row's source, and a stated lock reason instead of a silent disable. */
export function TodaysPlanSection({ allocations, readOnly, onChangeHours, locale }: TodaysPlanSectionProps) {
  const total = sumMinutes(allocations, (row) => row.plannedMinutes)

  return (
    <SectionCard
      title={standupStrings.my.todayHeader()}
      icon={<ListChecks strokeWidth={1.75} />}
      summary={standupStrings.my.todayPlanned({ hours: formatMinutesAsHours(total, { locale }) })}
    >
      {allocations.length === 0 ? (
        <p className="text-[15px] text-[var(--apple-secondary-label)]">{standupStrings.my.todayEmpty()}</p>
      ) : (
        <>
          {readOnly ? (
            <p className="text-[13px] text-[var(--apple-secondary-label)]">
              {standupStrings.my.lockedReason()}
            </p>
          ) : null}
          <ul className="flex flex-col gap-2">
            {allocations.map((row) => (
              <li
                key={row.allocationId}
                className="flex flex-wrap items-center gap-3 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-card p-3"
              >
                <IconChip icon={SOURCE_ICON[row.source] ?? SOURCE_ICON.assigned_in_standup} />

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-medium text-[var(--apple-label)]">
                      {row.title}
                    </span>
                    {SOURCE_LABEL[row.source] ? (
                      <StatusPill tone="neutral">{SOURCE_LABEL[row.source]()}</StatusPill>
                    ) : null}
                  </div>
                  <span className="font-apple-mono text-[13px] text-[var(--apple-tertiary-label)]">
                    {row.taskKey}
                  </span>
                </div>
                <label className="flex shrink-0 items-center gap-1.5 text-[13px]">
                  <span className="sr-only">{`Hours for ${row.title}`}</span>
                  <input
                    aria-label={`Hours for ${row.title}`}
                    type="number"
                    step={15}
                    min={0}
                    disabled={readOnly}
                    defaultValue={row.plannedMinutes}
                    onBlur={(event) => onChangeHours(row.allocationId, Number(event.target.value) as Minutes)}
                    className="w-16 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-card px-2 py-1 text-[13px] text-[var(--apple-label)] disabled:opacity-40"
                  />
                  <HoursValue minutes={row.plannedMinutes} locale={locale} />
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  )
}
