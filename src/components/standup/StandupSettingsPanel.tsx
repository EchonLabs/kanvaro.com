'use client'

/**
 * Hosts the three stand-up configuration screens inside the project Settings
 * tab (spec §15.2, §15.3, §15.4).
 *
 * Kanvaro's information architecture is flat — project settings are a tab, not a
 * nested route — so these live as sub-views here rather than at
 * `/projects/[id]/settings/calendar` as the spec's own §15.1 tree suggests.
 */
import { useState } from 'react'
import { CalendarDays, Settings2, Users } from 'lucide-react'

import { PermissionGate } from '@/lib/permissions/permission-components'
import { Permission } from '@/lib/permissions/permission-definitions'
import { cn } from '@/lib/utils'

import { CapacityMembersSettings } from './CapacityMembersSettings'
import { StandupConfigSettings } from './StandupConfigSettings'
import { WorkingCalendarSettings } from './WorkingCalendarSettings'

type StandupSettingsView = 'calendar' | 'configuration' | 'capacity'

const VIEWS: Array<{
  id: StandupSettingsView
  label: string
  icon: typeof CalendarDays
}> = [
  { id: 'calendar', label: 'Working Calendar', icon: CalendarDays },
  { id: 'configuration', label: 'Stand-up Configuration', icon: Settings2 },
  { id: 'capacity', label: 'Capacity & Members', icon: Users }
]

export function StandupSettingsPanel({ projectId }: { projectId: string }) {
  const [view, setView] = useState<StandupSettingsView>('calendar')

  return (
    <PermissionGate permission={Permission.STANDUP_VIEW} projectId={projectId}>
      <div className="space-y-5">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Stand-ups</h3>
          <p className="text-sm text-muted-foreground">
            Working days, stand-up rules, and each member&rsquo;s real daily capacity.
          </p>
        </div>

        {/* Segmented control, matching the app's existing Apple-styled tabs. */}
        <div
          role="tablist"
          aria-label="Stand-up settings"
          className="inline-flex flex-wrap gap-1 rounded-[var(--apple-radius-md)] bg-[var(--apple-tertiary-fill)] p-1"
        >
          {VIEWS.map(({ id, label, icon: Icon }) => {
            const active = view === id
            return (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setView(id)}
                className={cn(
                  'apple-transition flex items-center gap-2 rounded-[var(--apple-radius-sm)] px-3 py-1.5 text-[13px] font-medium',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-system-blue)]',
                  active
                    ? 'bg-card text-[var(--apple-label)] shadow-[0_1px_3px_rgba(0,0,0,0.10)]'
                    : 'text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            )
          })}
        </div>

        {view === 'calendar' && <WorkingCalendarSettings projectId={projectId} />}
        {view === 'configuration' && <StandupConfigSettings projectId={projectId} />}
        {view === 'capacity' && <CapacityMembersSettings projectId={projectId} />}
      </div>
    </PermissionGate>
  )
}
