import { Target } from 'lucide-react'

import { SummarySection } from '@/components/standup/summary/SummarySection'
import { standupStrings } from '@/lib/standup/strings'

import { Figure, hoursOrDash, percentOrDash } from './format'
import { RowsTable, TeamViewNote } from './RowsTable'
import type { AnalyticsPayload, SprintLinkContext } from './types'

const s = standupStrings.analytics

/**
 * §15.15 "Estimation accuracy": estimated over logged for completed tasks,
 * as `estimationAccuracy` defines it (VAR-17) — above 100% means work landed
 * faster than estimated. The table is its own rows (UI-13); the team view
 * keeps only the team line (NFR-13).
 */
export function AccuracyCard({ payload }: { payload: AnalyticsPayload; link: SprintLinkContext }) {
  const { team } = payload.accuracy
  const members = payload.view === 'full' ? payload.accuracy.members : []

  const row = (key: string, scope: string, figures: typeof team) => ({
    key,
    cells: {
      scope,
      tasks: <Figure value={figures.taskCount === 0 ? '—' : String(figures.taskCount)} />,
      estimated: <Figure value={hoursOrDash(figures.estimatedMinutes)} />,
      logged: <Figure value={hoursOrDash(figures.loggedMinutes)} />,
      accuracy: <Figure value={percentOrDash(figures.percent)} className="font-semibold" />
    }
  })

  return (
    <SummarySection
      id="analytics-accuracy"
      title={s.sectionAccuracy()}
      icon={Target}
      isEmpty={team.taskCount === 0}
      emptyText={s.emptyAccuracy()}
    >
      <div className="flex flex-col gap-3">
        <RowsTable
          caption={s.sectionAccuracy()}
          columns={[
            { key: 'scope', label: payload.view === 'full' ? s.columnMember() : s.columnScope() },
            { key: 'tasks', label: s.columnTasks(), align: 'right' },
            { key: 'estimated', label: s.columnEstimated(), align: 'right' },
            { key: 'logged', label: s.columnLogged(), align: 'right' },
            { key: 'accuracy', label: s.columnAccuracy(), align: 'right' }
          ]}
          rows={[
            row('team', s.team(), team),
            ...members.map((member) => row(member.memberId, member.name, member))
          ]}
        />
        {payload.view === 'aggregate' && <TeamViewNote />}
      </div>
    </SummarySection>
  )
}
