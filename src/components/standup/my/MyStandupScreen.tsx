'use client'

import { useCallback, useState } from 'react'
import { Info, Lock } from 'lucide-react'

import { isOwnRowReadOnly, isSelfSelectDisabled } from '@/lib/standup/own-row'
import { standupStrings } from '@/lib/standup/strings'
import { IconChip } from './shared/IconChip'
import { minutes, type Minutes } from '@/lib/standup/minutes'
import type { AttendanceStatus, CapacityBreakdown } from '@/lib/standup/capacity'
import type { BoardAllocationView } from '@/components/standup/run/CapacityBoard'
import type { YesterdayPanelData } from '@/lib/standup/yesterday-service'
import type { VariancePanel } from '@/lib/standup/variance-service'
import type { CarryForwardPanelView } from '@/lib/standup/carry-forward-service'
import type { BlockerPanelRow } from '@/lib/standup/blocker-service'
import type { StandupCandidate } from '@/lib/standup/my-standup-candidates'
import type { RaiseBlockerSubmitInput } from '@/components/standup/run/RaiseBlockerModal'

import { AlsoTodayBanner } from './sections/AlsoTodayBanner'
import { NextStandupStrip } from './sections/NextStandupStrip'
import { CapacitySection } from './sections/CapacitySection'
import { YesterdaySection } from './sections/YesterdaySection'
import { TodaysPlanSection } from './sections/TodaysPlanSection'
import { MyPositionSection } from './sections/MyPositionSection'
import { BlockersSection } from './sections/BlockersSection'
import { PullMoreWorkSection } from './sections/PullMoreWorkSection'

export interface MyStandupPoolTask {
  taskId: string
  key?: string
  title: string
  remainingEstimateMinutes: Minutes
}

export interface MyStandupMember {
  memberId: string
  name: string
  attendance?: AttendanceStatus
  capacity: CapacityBreakdown
  allocations: BoardAllocationView[]
}

export interface MyStandupApi {
  addAllocation(input: {
    memberId: string
    taskId: string
    selfSelect: boolean
    expectedVersion: number
  }): Promise<{ standupVersion: number }>
  changeHours(input: {
    allocationId: string
    plannedMinutes: Minutes
    expectedVersion: number
  }): Promise<{ standupVersion: number }>
  updateYesterdayRow(input: {
    taskId: string
    status?: string
    loggedMinutes?: number
    expectedVersion: number
  }): Promise<{ standupVersion: number; panel: YesterdayPanelData }>
  raiseBlocker(input: RaiseBlockerSubmitInput & { expectedVersion: number }): Promise<void>
}

export interface MyStandupScreenProps {
  standupId: string
  standupVersion: number
  status: string
  date: string
  member: MyStandupMember
  poolTasks: readonly MyStandupPoolTask[]
  allowSelfSelect: boolean
  api: MyStandupApi
  locale?: string
  scheduledStartAt?: string
  viewerTimeZone?: string
  projectTimeZone?: string
  durationMinutes?: number
  meetingUrl?: string
  sprintDayNumber?: number
  totalSprintDays?: number
  otherStandupsToday?: StandupCandidate[]
  yesterday?: YesterdayPanelData
  variance?: VariancePanel
  carryForward?: CarryForwardPanelView
  blockers?: BlockerPanelRow[]
}

export function MyStandupScreen({
  standupId,
  standupVersion,
  status,
  member,
  poolTasks,
  allowSelfSelect,
  api,
  locale,
  scheduledStartAt,
  viewerTimeZone,
  projectTimeZone,
  durationMinutes,
  meetingUrl,
  sprintDayNumber,
  totalSprintDays,
  otherStandupsToday = [],
  yesterday,
  variance,
  carryForward,
  blockers
}: MyStandupScreenProps) {
  const [version, setVersion] = useState(standupVersion)
  const [notice, setNotice] = useState<string | null>(null)

  const readOnly = isOwnRowReadOnly({ status, canAllocateOthers: false })
  const selfSelectDisabled = isSelfSelectDisabled({ status, canAllocateOthers: false, allowSelfSelect })

  const onChangeHours = useCallback(
    async (allocationId: string, plannedMinutes: Minutes) => {
      setNotice(null)
      try {
        const result = await api.changeHours({ allocationId, plannedMinutes, expectedVersion: version })
        setVersion(result.standupVersion)
      } catch {
        setNotice(standupStrings.my.editRejected())
      }
    },
    [api, version]
  )

  const onAdd = useCallback(
    async (taskId: string) => {
      setNotice(null)
      try {
        const result = await api.addAllocation({
          memberId: member.memberId,
          taskId,
          selfSelect: true,
          expectedVersion: version
        })
        setVersion(result.standupVersion)
      } catch {
        setNotice(standupStrings.my.addRejected())
      }
    },
    [api, member.memberId, version]
  )

  const onRaiseBlocker = useCallback(
    async (input: RaiseBlockerSubmitInput) => {
      setNotice(null)
      try {
        await api.raiseBlocker({ ...input, expectedVersion: version })
      } catch {
        setNotice(standupStrings.my.editRejected())
      }
    },
    [api, version]
  )

  const hasGap = member.capacity.status === 'under' || member.capacity.status === 'zero'

  return (
    <div className="flex flex-col gap-4 p-4">
      <AlsoTodayBanner candidates={otherStandupsToday} />

      <NextStandupStrip
        status={status}
        scheduledStartAt={scheduledStartAt}
        durationMinutes={durationMinutes}
        meetingUrl={meetingUrl}
        sprintDayNumber={sprintDayNumber}
        totalSprintDays={totalSprintDays}
        viewerTimeZone={viewerTimeZone}
        projectTimeZone={projectTimeZone}
      />

      {notice ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)] p-2.5 text-[13px] text-[var(--apple-label)]"
        >
          <IconChip icon={<Info strokeWidth={1.75} />} size="sm" />
          {notice}
        </p>
      ) : null}

      {readOnly ? (
        <p className="flex items-center gap-2 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)] p-2.5 text-[13px] text-[var(--apple-secondary-label)]">
          <IconChip icon={<Lock strokeWidth={1.75} />} size="sm" />
          {standupStrings.my.readOnlyBanner()}
        </p>
      ) : null}

      <CapacitySection
        capacity={member.capacity}
        allocationCount={member.allocations.length}
        debt={
          variance?.members.find((row) => row.memberId === member.memberId)
        }
        locale={locale}
      />

      <YesterdaySection
        standupId={standupId}
        memberId={member.memberId}
        panel={yesterday}
        varianceRows={variance?.rows}
        readOnly={status !== 'Ready'}
        api={{ updateYesterdayRow: api.updateYesterdayRow }}
        expectedVersion={version}
        onVersionChange={setVersion}
        locale={locale}
      />

      <TodaysPlanSection
        allocations={member.allocations}
        readOnly={readOnly}
        onChangeHours={onChangeHours}
        locale={locale}
      />

      <MyPositionSection memberId={member.memberId} carryForward={carryForward} locale={locale} />

      <BlockersSection
        memberId={member.memberId}
        blockers={blockers}
        allocations={member.allocations}
        onRaise={onRaiseBlocker}
        locale={locale}
      />

      <PullMoreWorkSection
        poolTasks={poolTasks}
        allowSelfSelect={allowSelfSelect}
        hasGap={hasGap}
        disabled={selfSelectDisabled}
        onAdd={onAdd}
        locale={locale}
      />
    </div>
  )
}
