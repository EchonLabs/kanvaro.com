'use client'

/**
 * Hosts the three stand-up configuration screens inside the project Settings
 * tab (spec §15.2, §15.3, §15.4).
 *
 * Kanvaro's information architecture is flat — project settings are a tab, not a
 * nested route — so these live as sub-views here rather than at
 * `/projects/[id]/settings/calendar` as the spec's own §15.1 tree suggests.
 */
import { useRef, useState, type KeyboardEvent } from 'react'
import { CalendarDays, Settings2, Users } from 'lucide-react'

import { usePermissions } from '@/lib/permissions/permission-context'
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

/** Stable ids so each tab and its panel can name each other. */
const tabId = (view: StandupSettingsView) => `standup-settings-tab-${view}`
const panelId = (view: StandupSettingsView) => `standup-settings-panel-${view}`

export function StandupSettingsPanel({ projectId }: { projectId: string }) {
  const [view, setView] = useState<StandupSettingsView>('calendar')
  const { hasPermission, loading, permissions } = usePermissions()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  /**
   * The arrow-key navigation `role="tablist"` promises.
   *
   * Declaring the role without this is worse than using plain buttons: assistive
   * technology announces a tab list, the user presses the arrow keys it implies,
   * and nothing happens. Selection follows focus, which is the correct automatic
   * behaviour here because switching panels is cheap and has no side effects.
   */
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const lastIndex = VIEWS.length - 1

    const nextIndex =
      event.key === 'ArrowRight'
        ? (index === lastIndex ? 0 : index + 1)
        : event.key === 'ArrowLeft'
          ? (index === 0 ? lastIndex : index - 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? lastIndex
              : null

    if (nextIndex === null) return

    // These keys would otherwise scroll the settings tab underneath the control.
    event.preventDefault()
    setView(VIEWS[nextIndex].id)
    tabRefs.current[nextIndex]?.focus()
  }

  // STANDUP_CONFIGURE, not STANDUP_VIEW. Team Members and QA hold VIEW because
  // they attend stand-ups (§3.2); gating on it showed them the whole settings
  // panel, tablist included, for a project they cannot configure.
  //
  // Checked directly rather than through PermissionGate, which renders its
  // children while permissions load to avoid flicker. That trade is right for
  // ordinary content and wrong here: it would flash the entire configuration
  // surface at every Team Member on each page load.
  if (loading || !permissions || !hasPermission(Permission.STANDUP_CONFIGURE, projectId)) {
    return null
  }

  return (
    <div className="space-y-5 border-t border-[var(--apple-separator)] pt-6">
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
          {VIEWS.map(({ id, label, icon: Icon }, index) => {
            const active = view === id
            return (
              <button
                key={id}
                id={tabId(id)}
                ref={(element) => {
                  tabRefs.current[index] = element
                }}
                role="tab"
                type="button"
                aria-selected={active}
                aria-controls={panelId(id)}
                // Roving tabindex: one Tab stop for the whole control, then the
                // arrow keys move within it. Without this a keyboard user pays
                // three Tab presses to get past a single segmented control.
                tabIndex={active ? 0 : -1}
                onKeyDown={(event) => onTabKeyDown(event, index)}
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

        {/* The panel names the tab that controls it, so assistive technology can
            say which section it landed in. Only the selected panel is rendered —
            the others mount data-fetching screens, and `hidden` would still run
            all three on every page load. */}
        <div
          role="tabpanel"
          id={panelId(view)}
          aria-labelledby={tabId(view)}
          // A panel whose content is not itself focusable needs to be reachable,
          // or a keyboard user arrives at the tab and cannot get into what it
          // selected.
          tabIndex={0}
        >
          {view === 'calendar' && <WorkingCalendarSettings projectId={projectId} />}
          {view === 'configuration' && <StandupConfigSettings projectId={projectId} />}
          {view === 'capacity' && <CapacityMembersSettings projectId={projectId} />}
        </div>
      </div>
    </div>
  )
}
