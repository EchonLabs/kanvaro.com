import {
  AlertTriangle,
  CheckCircle2,
  CornerDownRight,
  Settings,
  Slash,
  TrendingDown,
  type LucideIcon
} from 'lucide-react'

import { StatCard } from '@/components/standup/my/shared/StatCard'
import type { IconChipTone } from '@/components/standup/my/shared/IconChip'
import { formatMinutesAsHours, minutes as toMinutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'

import type { SummaryStats } from './stats'

const s = standupStrings.summary

/**
 * The six figures, derived from the stats rather than spelled out as markup,
 * so a tile is a row of data: adding or reordering one is an edit to this
 * array, never to the JSX below.
 *
 * The tiles themselves are the stand-up module's shared `StatCard` — the same
 * component the "My stand-up" screen's grid uses, so the two screens' stat
 * rows are one component rather than two that happen to look alike. That also
 * puts the figure on the app's own type and colour tokens (`--apple-*`)
 * instead of a size this file picked for itself.
 *
 * The tone is category colour, not status colour: the hue says which section
 * the tile belongs to so the grid is scannable, and none of them changes with
 * the figure — a red "0 open blockers" would read as an alarm about nothing.
 * Purple is carry-forward's, because that section has no other tone of its
 * own and two orange tiles side by side lose the grid's scannability.
 */
interface Tile {
  /** The section this tile counts — the grid doubles as a table of contents. */
  href: string
  icon: LucideIcon
  tone: IconChipTone
  value: string
  label: string
}

function tilesFor(stats: SummaryStats): Tile[] {
  return [
    {
      href: '#completed-yesterday-section',
      icon: CheckCircle2,
      tone: 'green',
      value: String(stats.completedCount),
      label: s.sectionCompletedYesterday()
    },
    {
      href: '#variance-section',
      icon: AlertTriangle,
      tone: 'orange',
      value: String(stats.overEstimatedCount),
      label: 'Over-estimated tasks'
    },
    {
      href: '#debt-section',
      icon: TrendingDown,
      tone: 'blue',
      value: formatMinutesAsHours(toMinutes(Math.round(stats.debtMinutes))),
      label: s.sectionDebtMovements()
    },
    {
      href: '#blockers-raised-section',
      icon: Slash,
      tone: 'red',
      value: String(stats.openBlockerCount),
      label: 'Open blockers'
    },
    {
      href: '#carry-forward-section',
      icon: CornerDownRight,
      tone: 'purple',
      value: String(stats.carryForwardCount),
      label: s.sectionCarryForward()
    },
    {
      href: '#overrides-section',
      icon: Settings,
      tone: 'orange',
      value: String(stats.overrideCount),
      label: s.sectionOverrides()
    }
  ]
}

export function SummaryStatGrid({ stats }: { stats: SummaryStats }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tilesFor(stats).map(({ href, icon: Icon, tone, value, label }) => (
        <StatCard
          key={href}
          data-testid="summary-stat-tile"
          href={href}
          icon={<Icon strokeWidth={2} aria-hidden="true" />}
          tone={tone}
          value={value}
          label={label}
        />
      ))}
    </div>
  )
}
