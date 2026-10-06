'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ExternalLink, Lock } from 'lucide-react'

import { Button } from '@/components/ui/Button'

import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { isOwnRowReadOnly, isSelfSelectDisabled } from '@/lib/standup/own-row'
import { standupStrings } from '@/lib/standup/strings'
import type { Minutes } from '@/lib/standup/minutes'
import type { AttendanceStatus, CapacityBreakdown } from '@/lib/standup/capacity'
import type { BoardAllocationView } from '@/components/standup/run/CapacityBoard'
import type { YesterdayPanelData } from '@/lib/standup/yesterday-service'
import type { VariancePanel } from '@/lib/standup/variance-service'
import type { CarryForwardPanelView } from '@/lib/standup/carry-forward-service'
import type { BlockerPanelRow } from '@/lib/standup/blocker-service'
import type { StandupCandidate } from '@/lib/standup/my-standup-candidates'
import type { RaiseBlockerSubmitInput } from '@/components/standup/run/RaiseBlockerModal'

import { ProjectSwitcher } from './sections/ProjectSwitcher'
import { NextStandupStrip } from './sections/NextStandupStrip'
import { CapacitySection } from './sections/CapacitySection'
import { YesterdaySection } from './sections/YesterdaySection'
import { TodaysPlanSection } from './sections/TodaysPlanSection'
import { MyPositionSection } from './sections/MyPositionSection'
import { BlockersSection } from './sections/BlockersSection'
import { PullMoreWorkSection } from './sections/PullMoreWorkSection'
import { JourneyStep } from './shared/JourneyStep'

export interface MyStandupPoolTask {
  taskId: string
  key?: string
  title: string
  remainingEstimateMinutes: Minutes
  /** The board's pool rows carry it (`PoolTask.priority`); shown on the pull-work card when present. */
  priority?: string
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
  /** Lets a PM jump from their own stand-up screen to the project's stand-up
   *  schedule hub. Paired with `sprintId`, which gates the button on a
   *  concrete sprint stand-up existing even though the destination URL only
   *  needs `projectId`; the button is omitted entirely when either could not
   *  be resolved. */
  projectId?: string
  sprintId?: string
  /** Shown in the header's breadcrumb, as plain text, so a member on more
   *  than one project's sprint team can tell at a glance which stand-up this
   *  is. Not a control — the filter button in the action row is. */
  projectName?: string
  /** Shown on the filter button beside the project name. */
  sprintName?: string
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
  /** Every open stand-up the viewer is expected at, this one included — the
   *  header's filter button is the control over them. */
  standupsToday?: StandupCandidate[]
  yesterday?: YesterdayPanelData
  variance?: VariancePanel
  carryForward?: CarryForwardPanelView
  blockers?: BlockerPanelRow[]
}

/**
 * UI-12's member view, laid out as the Figma "My Stand-up page redesign": a
 * header, a stack of status banners, then a four-step guided journey —
 * review yesterday, confirm today, my position, raise blockers.
 */
export function MyStandupScreen({
  standupId,
  standupVersion,
  status,
  projectId,
  sprintId,
  projectName,
  sprintName,
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
  standupsToday = [],
  yesterday,
  variance,
  carryForward,
  blockers
}: MyStandupScreenProps) {
  const [version, setVersion] = useState(standupVersion)
  const [notice, setNotice] = useState<Notice | null>(null)
  const router = useRouter()
  const { hasPermission } = usePermissions()

  // A PM lands here to run their own stand-up, but often also wants the
  // project's full stand-up schedule — the same destination the sprint
  // page's "Stand-ups" button goes to. Gated the same way
  // `PlanningWorkspace`'s facilitator controls are, so the button only ever
  // appears for someone who could actually use the destination, and only
  // once there is a concrete sprint stand-up to link to.
  const canViewSchedule =
    Boolean(projectId) && Boolean(sprintId) && hasPermission(Permission.SPRINT_UPDATE, projectId)

  const readOnly = isOwnRowReadOnly({ status, canAllocateOthers: false })
  const selfSelectDisabled = isSelfSelectDisabled({ status, canAllocateOthers: false, allowSelfSelect })

  const onChangeHours = useCallback(
    async (allocationId: string, plannedMinutes: Minutes) => {
      setNotice(null)
      try {
        const result = await api.changeHours({ allocationId, plannedMinutes, expectedVersion: version })
        setVersion(result.standupVersion)
      } catch (error) {
        setNotice(noticeFor(error, standupStrings.my.editRejected()))
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
      } catch (error) {
        setNotice(noticeFor(error, standupStrings.my.addRejected()))
      }
    },
    [api, member.memberId, version]
  )

  const onRaiseBlocker = useCallback(
    async (input: RaiseBlockerSubmitInput) => {
      setNotice(null)
      try {
        await api.raiseBlocker({ ...input, expectedVersion: version })
      } catch (error) {
        setNotice(noticeFor(error, standupStrings.my.editRejected()))
      }
    },
    [api, version]
  )

  return (
    // The negative margins cancel `MainLayout`'s `<main>` padding (the same
    // move the sprint planning page makes), so this screen's own 40px gutter is
    // the only one.
    //
    // No canvas paint and no fixed backdrop underlay: those existed because the
    // Figma palette's `#F8FAFC`/`#090A0F` canvas differed from the app's own
    // page background and so had to be forced over `MainLayout`'s backdrop and
    // the space beside `max-w-7xl`. This screen now sits on the app's own page
    // background like every other one, so the token is gone with the paint.
    <div className="my-standup -m-3 flex flex-col gap-6 px-4 py-6 sm:-m-4 sm:p-6 lg:-m-6 lg:p-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 apple-type-subheadline">
            <Link
              href="/dashboard"
              className="font-medium uppercase text-[var(--my-subtle)] hover:text-[var(--my-muted)]"
            >
              {standupStrings.my.breadcrumbRoot()}
            </Link>
            {/* Plain text, not a control — switching projects lives on the
                filter button in the action row below, so there is exactly
                one place on screen that changes what you are looking at. */}
            {projectName ? (
              <>
                <span aria-hidden className="text-[var(--my-subtle)]">
                  /
                </span>
                <span className="truncate font-medium text-[var(--my-blue)]">{projectName}</span>
              </>
            ) : null}
          </nav>
          <h1 className="apple-type-title1 font-bold text-[var(--my-text)]">
            {standupStrings.my.title()}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Lets a member on more than one project's sprint team jump to
              another open stand-up, or just see which project/sprint this
              one belongs to. Not gated on canViewSchedule — unlike "Open full
              stand-up", every member gets this, not just whoever can run the
              project's stand-ups. */}
          {projectName || standupsToday.length > 0 ? (
            <ProjectSwitcher
              currentStandupId={standupId}
              currentProjectId={projectId}
              currentProjectName={projectName}
              currentSprintName={sprintName}
              candidates={standupsToday}
              locale={locale}
            />
          ) : null}
          {canViewSchedule ? (
            // Points at the project's stand-up schedule hub, matching the
            // "Stand-ups" button on the sprint page (src/app/sprints/[id]/page.tsx)
            // so the two surfaces land in the same place rather than one going
            // to the hub and the other straight to a single day's meeting.
            <Button
              type="button"
              onClick={() => router.push(`/projects/${projectId}/standups`)}
              className="gap-2 font-semibold"
            >
              <ExternalLink className="h-4 w-4" strokeWidth={2} aria-hidden />
              {standupStrings.my.openFullStandup()}
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex w-full flex-col gap-3">
        {notice ? (
          <p
            role="status"
            className="flex w-full items-center gap-3 rounded-[var(--apple-radius-sm)] border border-[var(--my-amber)] bg-[var(--my-amber-tint)] px-4 py-3 apple-type-callout text-[var(--my-text)]"
          >
            <AlertTriangle
              className="h-[18px] w-[18px] shrink-0 text-[var(--my-amber)]"
              strokeWidth={2}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <strong className="font-semibold">{notice.title}</strong> {notice.message}
            </span>
          </p>
        ) : null}

        <NextStandupStrip
          status={status}
          scheduledStartAt={scheduledStartAt}
          durationMinutes={durationMinutes}
          meetingUrl={meetingUrl}
          sprintDayNumber={sprintDayNumber}
          totalSprintDays={totalSprintDays}
          viewerTimeZone={viewerTimeZone}
          projectTimeZone={projectTimeZone}
          locale={locale}
        />

        {readOnly ? (
          <p className="flex w-full items-center gap-2.5 rounded-[var(--apple-radius-sm)] bg-[var(--my-raised)] px-4 py-2.5 apple-type-subheadline text-[var(--my-muted)]">
            <Lock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
            {standupStrings.my.readOnlyBanner({ status })}
          </p>
        ) : null}
      </div>

      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="apple-type-subheadline font-semibold uppercase text-[var(--my-subtle)]">
            {standupStrings.my.journeyEyebrow()}
          </p>
          <h2 className="apple-type-title2 font-bold text-[var(--my-text)]">
            {standupStrings.my.journeyTitle()}
          </h2>
          <p className="apple-type-callout text-[var(--my-muted)]">{standupStrings.my.journeyBody()}</p>
        </div>

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

        <JourneyStep
          step={2}
          title={standupStrings.my.todayStepTitle()}
          subtitle={standupStrings.my.todayStepSubtitle()}
          state={
            readOnly
              ? { label: standupStrings.my.stateLocked(), tone: 'neutral' }
              : { label: standupStrings.my.stateInProgress(), tone: 'blue' }
          }
        >
          <CapacitySection
            capacity={member.capacity}
            allocationCount={member.allocations.length}
            debt={variance?.members.find((row) => row.memberId === member.memberId)}
            locale={locale}
          />
          <TodaysPlanSection
            allocations={member.allocations}
            capacity={member.capacity}
            readOnly={readOnly}
            onChangeHours={onChangeHours}
            locale={locale}
          >
            <PullMoreWorkSection
              poolTasks={poolTasks}
              allowSelfSelect={allowSelfSelect}
              gapMinutes={member.capacity.gapMinutes}
              disabled={selfSelectDisabled}
              onAdd={onAdd}
              locale={locale}
            />
          </TodaysPlanSection>
        </JourneyStep>

        <MyPositionSection memberId={member.memberId} carryForward={carryForward} locale={locale} />

        <BlockersSection
          memberId={member.memberId}
          blockers={blockers}
          onRaise={onRaiseBlocker}
          locale={locale}
        />
      </div>
    </div>
  )
}

interface Notice {
  title: string
  message: string
}

/**
 * Every refusal here is a server decision the screen cannot predict. A version
 * clash (RUN-23's `STALE_STANDUP`) gets the design's "server edit conflict"
 * lead-in and says how to recover; anything else keeps its own message.
 */
function noticeFor(error: unknown, message: string): Notice {
  if ((error as { code?: string } | null)?.code === 'STALE_STANDUP') {
    return {
      title: standupStrings.my.conflictTitle(),
      message: `${message} ${standupStrings.my.conflictDetail()}`
    }
  }
  return { title: standupStrings.my.refusedTitle(), message }
}
