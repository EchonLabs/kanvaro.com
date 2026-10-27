import { Repeat } from 'lucide-react'

import { SummarySection } from '@/components/standup/summary/SummarySection'
import { standupStrings } from '@/lib/standup/strings'

import { Figure, hours } from './format'
import { RowsTable } from './RowsTable'
import type { AnalyticsPayload, SprintLinkContext } from './types'

const s = standupStrings.analytics

/**
 * §15.15 "Spill chains": the longest-carried tasks, with chain length and
 * hours logged against the original estimate. A task is not an individual
 * figure, so both views list the chains; only the full view names the owner.
 */
export function SpillChainsCard({ payload }: { payload: AnalyticsPayload; link: SprintLinkContext }) {
  const chains = payload.spillChains
  const full = payload.view === 'full'

  return (
    <SummarySection
      id="analytics-spill-chains"
      title={s.sectionSpillChains()}
      icon={Repeat}
      isEmpty={chains.length === 0}
      emptyText={s.emptySpillChains()}
    >
      <RowsTable
        caption={s.sectionSpillChains()}
        columns={[
          { key: 'task', label: s.columnTask() },
          { key: 'chain', label: s.columnChain(), align: 'right' },
          { key: 'logged', label: s.columnLogged(), align: 'right' },
          ...(full ? [{ key: 'owner', label: s.columnOwner() }] : [])
        ]}
        rows={chains.map((chain) => ({
          key: chain.taskId,
          cells: {
            task: (
              <span>
                {chain.taskKey && (
                  <span className="font-apple-mono mr-1.5 text-[var(--plan-muted)]">{chain.taskKey}</span>
                )}
                {chain.title}
              </span>
            ),
            chain: <Figure value={s.chainLength({ length: chain.chainLength })} />,
            logged: (
              <Figure
                value={s.loggedAgainst({
                  logged: hours(chain.loggedMinutes),
                  estimate: hours(chain.originalEstimateMinutes)
                })}
              />
            ),
            owner: 'assigneeName' in chain ? (chain.assigneeName ?? '—') : undefined
          }
        }))}
      />
    </SummarySection>
  )
}
