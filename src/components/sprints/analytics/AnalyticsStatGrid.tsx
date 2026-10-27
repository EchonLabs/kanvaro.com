import { CalendarCheck, CornerDownRight, Settings, TrendingDown, type LucideIcon } from 'lucide-react'

import { StatCard } from '@/components/standup/my/shared/StatCard'
import type { IconChipTone } from '@/components/standup/my/shared/IconChip'
import { standupStrings } from '@/lib/standup/strings'

import { DASH, hours, hoursOrDash, percentOrDash } from './format'
import type { AnalyticsHeadline } from './types'

const s = standupStrings.analytics

interface Tile {
  href: string
  icon: LucideIcon
  tone: IconChipTone
  value: string
  label: string
  /** The figure's context, for the tile's accessible name and tooltip. */
  detail: string
}

/**
 * The four headline figures, each a link to the widget that explains it —
 * the same `StatCard` grid the Summary screen opens with. Tone is category
 * colour, as there: it never changes with the figure.
 */
function tilesFor(headline: AnalyticsHeadline): Tile[] {
  const debtChange = headline.debtChangeMinutes7d === 0 ? DASH : hours(headline.debtChangeMinutes7d, { signed: true })

  return [
    {
      href: '#analytics-discipline',
      icon: CalendarCheck,
      tone: 'green',
      value: percentOrDash(headline.onTimeRate),
      label: s.statOnTime(),
      detail: s.onTimeDetail({ missed: headline.missedCount })
    },
    {
      href: '#analytics-debt-trend',
      icon: TrendingDown,
      tone: 'blue',
      value: hoursOrDash(headline.outstandingDebtMinutes),
      label: s.statOpenDebt(),
      detail: s.debtChangeDetail({ change: debtChange })
    },
    {
      href: '#analytics-overrides',
      icon: Settings,
      tone: 'orange',
      value: headline.overrideCount === 0 ? DASH : String(headline.overrideCount),
      label: s.statOverrides(),
      detail: headline.topOverrideType ? s.overrideType({ type: headline.topOverrideType }) : DASH
    },
    {
      href: '#analytics-ageing',
      icon: CornerDownRight,
      tone: 'purple',
      value: headline.chronicCarryForwardCount === 0 ? DASH : String(headline.chronicCarryForwardCount),
      label: s.statChronic(),
      detail: s.chronicBand({ count: headline.chronicCarryForwardCount })
    }
  ]
}

export function AnalyticsStatGrid({ headline }: { headline: AnalyticsHeadline }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tilesFor(headline).map(({ href, icon: Icon, tone, value, label, detail }) => (
        <StatCard
          key={href}
          data-testid="analytics-stat-tile"
          href={href}
          icon={<Icon strokeWidth={2} aria-hidden="true" />}
          tone={tone}
          value={value}
          label={label}
          title={detail}
          aria-label={`${label}: ${value === DASH ? 'none' : value}. ${detail}`}
        />
      ))}
    </div>
  )
}
