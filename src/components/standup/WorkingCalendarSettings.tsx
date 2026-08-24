'use client'

/**
 * Working Calendar screen (spec §15.2).
 *
 * Decides which dates are working days, which is the single question the whole
 * stand-up module is downstream of. Three behaviours are requirements rather
 * than niceties:
 *
 * - **UI-1** the impact panel recomputes live, before saving, and names the
 *   specific stand-up dates that would be created or skipped.
 * - **UI-2** saving a change that affects stand-ups opens a confirmation listing
 *   every affected date with its status and what will happen to it.
 * - **UI-3** dates that cannot be changed (completed stand-ups) are shown as
 *   blocked with the reason, and the rest of the change still applies.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CalendarPlus,
  Check,
  Globe,
  Loader2,
  Lock,
  Plus,
  Trash2
} from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useNotify } from '@/lib/notify'
import { cn } from '@/lib/utils'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface HolidaySetOption {
  id: string
  name: string
  description?: string
  countryCode?: string
}

interface CalendarOverride {
  id: string
  date: string
  name: string
  effect: 'non_working' | 'observed_as_working'
  isPartialDay: boolean
  recurringAnnually: boolean
  appliesToMemberIds: string[]
}

interface CalendarState {
  workingDaysOfWeek: number[]
  standardHoursPerDay: number
  timezone: string
  subscribedHolidaySetIds: string[]
  overrides: CalendarOverride[]
}

interface OverrideMemberOption {
  memberId: string
  firstName?: string
  lastName?: string
  email?: string
}

const memberLabel = (member: OverrideMemberOption) =>
  [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email || 'Unnamed member'

interface ImpactItem {
  date: string
  disposition: string
  currentStatus?: string
  message: string
  blocked: boolean
}

interface WorkingDay {
  date: string
  isWorkingDay: boolean
  reason: string
  holidayName?: string
  isPartialDay: boolean
  optionalHolidays: Array<{ id: string; name: string }>
}

export function WorkingCalendarSettings({ projectId }: { projectId: string }) {
  const notify = useNotify()

  const [calendar, setCalendar] = useState<CalendarState | null>(null)
  const [inherited, setInherited] = useState(false)
  const [holidaySets, setHolidaySets] = useState<HolidaySetOption[]>([])
  const [coverageWarning, setCoverageWarning] = useState<{ message: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Preview month for the calendar grid.
  const [previewMonth, setPreviewMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [workingDays, setWorkingDays] = useState<WorkingDay[]>([])

  // UI-1: recomputed impact of the pending, unsaved change.
  const [impact, setImpact] = useState<{ items: ImpactItem[]; summary: string } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false)

  const timezones = useMemo(() => listTimezones(), [])

  const loadCalendar = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/working-calendar`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error?.message ?? 'Could not load the calendar')

      setCalendar({
        workingDaysOfWeek: payload.data.calendar.workingDaysOfWeek,
        standardHoursPerDay: payload.data.calendar.standardHoursPerDay,
        timezone: payload.data.calendar.timezone,
        subscribedHolidaySetIds: payload.data.calendar.subscribedHolidaySetIds,
        overrides: payload.data.calendar.overrides
      })
      setInherited(payload.data.inherited)
      setHolidaySets(payload.data.availableHolidaySets)
      setCoverageWarning(payload.data.coverageWarning)
    } catch (error) {
      notify.error({ title: 'Could not load the calendar', message: errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }, [projectId, notify])

  const loadPreview = useCallback(async () => {
    const from = `${previewMonth}-01`
    const to = lastDayOfMonth(previewMonth)

    try {
      const response = await fetch(
        `/api/projects/${projectId}/working-calendar/working-days?from=${from}&to=${to}`
      )
      const payload = await response.json()
      if (response.ok) setWorkingDays(payload.data.workingDays)
    } catch {
      // A failed preview is not worth interrupting the user for; the grid just
      // stays on its previous state.
    }
  }, [projectId, previewMonth])

  useEffect(() => {
    loadCalendar()
  }, [loadCalendar])

  useEffect(() => {
    if (!loading) loadPreview()
  }, [loading, loadPreview])

  /** UI-1 — recompute impact as soon as the working week changes, before saving. */
  const previewWorkingWeek = useCallback(
    async (workingDaysOfWeek: number[]) => {
      try {
        const response = await fetch(
          `/api/projects/${projectId}/working-calendar/preview-impact`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ change: { kind: 'working_week', workingDaysOfWeek } })
          }
        )
        const payload = await response.json()
        if (response.ok) setImpact({ items: payload.data.items, summary: payload.data.summary })
      } catch {
        setImpact(null)
      }
    },
    [projectId]
  )

  const toggleDay = (day: number) => {
    if (!calendar) return
    const next = calendar.workingDaysOfWeek.includes(day)
      ? calendar.workingDaysOfWeek.filter((d) => d !== day)
      : [...calendar.workingDaysOfWeek, day].sort()

    if (next.length === 0) {
      notify.error({ title: 'At least one working day must be selected' })
      return
    }

    setCalendar({ ...calendar, workingDaysOfWeek: next })
    previewWorkingWeek(next)
  }

  const save = async () => {
    if (!calendar) return
    setSaving(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/working-calendar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workingDaysOfWeek: calendar.workingDaysOfWeek,
          standardHoursPerDay: calendar.standardHoursPerDay,
          timezone: calendar.timezone,
          subscribedHolidaySetIds: calendar.subscribedHolidaySetIds
        })
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error?.message ?? 'Could not save the calendar')

      notify.success({ title: 'Working calendar saved' })
      setInherited(false)
      setImpact(null)
      setConfirmOpen(false)
      await Promise.all([loadCalendar(), loadPreview()])
    } catch (error) {
      notify.error({ title: 'Could not save the calendar', message: errorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  /** UI-2 — a change that affects stand-ups must be confirmed explicitly. */
  const attemptSave = () => {
    if (impact && impact.items.length > 0) setConfirmOpen(true)
    else save()
  }

  const removeOverride = async (override: CalendarOverride) => {
    try {
      const response = await fetch(
        `/api/projects/${projectId}/working-calendar/overrides/${override.id}`,
        { method: 'DELETE' }
      )
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error?.message ?? 'Could not remove the override')

      notify.success({ title: `Removed "${override.name}"` })
      await Promise.all([loadCalendar(), loadPreview()])
    } catch (error) {
      notify.error({ title: 'Could not remove the override', message: errorMessage(error) })
    }
  }

  if (loading) return <CalendarSkeleton />
  if (!calendar) return null

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-[17px] font-semibold text-[var(--apple-label)]">Working Calendar</h4>
          <p className="text-[13px] text-[var(--apple-secondary-label)]">
            Decides which dates get a stand-up. Everything else depends on this.
          </p>
        </div>
        <Button onClick={attemptSave} disabled={saving} size="sm">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save calendar
        </Button>
      </header>

      {inherited && (
        <Notice tone="info">
          This project inherits the organisation working week. Saving creates a project-specific
          calendar you can then adjust.
        </Notice>
      )}

      {coverageWarning && <Notice tone="warning">{coverageWarning.message}</Notice>}

      {/* Working week */}
      <Section title="Working week">
        <div className="flex flex-wrap gap-2">
          {DAY_LABELS.map((label, day) => {
            const active = calendar.workingDaysOfWeek.includes(day)
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggleDay(day)}
                aria-pressed={active}
                className={cn(
                  'apple-transition rounded-[var(--apple-radius-sm)] border px-3 py-2 text-[13px] font-medium',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-system-blue)]',
                  active
                    ? 'border-[var(--apple-system-blue)] bg-[var(--apple-system-blue)] text-white'
                    : 'border-[var(--apple-separator)] text-[var(--apple-secondary-label)] hover:bg-[var(--apple-quaternary-fill)]'
                )}
              >
                {label}
              </button>
            )
          })}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="standard-hours">Standard hours per working day</Label>
            <Input
              id="standard-hours"
              type="number"
              min={0.5}
              max={24}
              step={0.5}
              value={calendar.standardHoursPerDay}
              onChange={(event) =>
                setCalendar({ ...calendar, standardHoursPerDay: Number(event.target.value) })
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="timezone">Timezone</Label>
            <Select
              value={calendar.timezone}
              onValueChange={(timezone) => setCalendar({ ...calendar, timezone })}
            >
              <SelectTrigger id="timezone">
                <SelectValue placeholder="Select a timezone" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {timezones.map((zone) => (
                  <SelectItem key={zone} value={zone}>
                    {zone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="flex items-center gap-1.5 text-[12px] text-[var(--apple-tertiary-label)]">
              <Globe className="h-3 w-3" />
              Decides which calendar date a stand-up belongs to.
            </p>
          </div>
        </div>
      </Section>

      {/* Holiday calendars */}
      <Section title="Holiday calendars">
        {holidaySets.length === 0 ? (
          <p className="text-[13px] text-[var(--apple-secondary-label)]">
            No holiday calendars exist yet. An organisation admin can create one and import a
            gazette.
          </p>
        ) : (
          <div className="space-y-2">
            {holidaySets.map((set) => {
              const subscribed = calendar.subscribedHolidaySetIds.includes(set.id)
              return (
                <label
                  key={set.id}
                  className="apple-transition flex cursor-pointer items-center gap-3 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] p-3 hover:bg-[var(--apple-quaternary-fill)]"
                >
                  <Checkbox
                    checked={subscribed}
                    onCheckedChange={() =>
                      setCalendar({
                        ...calendar,
                        subscribedHolidaySetIds: subscribed
                          ? calendar.subscribedHolidaySetIds.filter((id) => id !== set.id)
                          : [...calendar.subscribedHolidaySetIds, set.id]
                      })
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium text-[var(--apple-label)]">
                      {set.name}
                    </span>
                    {set.description && (
                      <span className="block text-[12px] text-[var(--apple-tertiary-label)]">
                        {set.description}
                      </span>
                    )}
                  </span>
                  {set.countryCode && <Badge variant="secondary">{set.countryCode}</Badge>}
                </label>
              )
            })}
          </div>
        )}
      </Section>

      {/* Project overrides — layer 3 */}
      <Section
        title="Project overrides"
        action={
          <Button variant="outline" size="sm" onClick={() => setOverrideDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add override
          </Button>
        }
      >
        {calendar.overrides.length === 0 ? (
          <p className="text-[13px] text-[var(--apple-secondary-label)]">
            No overrides. Add one to close a working day, or to work a day the holiday calendar
            marks as a holiday.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--apple-separator)]">
            {calendar.overrides.map((override) => (
              <li key={override.id} className="flex items-center gap-3 py-2.5">
                <span className="font-apple-mono w-24 shrink-0 text-[13px] tabular-nums text-[var(--apple-secondary-label)]">
                  {override.date}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--apple-label)]">
                  {override.name}
                </span>
                <Badge
                  variant={override.effect === 'non_working' ? 'destructive' : 'default'}
                  className="shrink-0"
                >
                  {override.effect === 'non_working' ? 'Non-working' : 'Observed as working'}
                </Badge>
                {override.recurringAnnually && (
                  <Badge variant="secondary" className="shrink-0">
                    Annual
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeOverride(override)}
                  aria-label={`Remove ${override.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Calendar preview */}
      <Section
        title="Calendar preview"
        action={
          <Input
            type="month"
            value={previewMonth}
            onChange={(event) => setPreviewMonth(event.target.value)}
            className="h-8 w-40 text-[13px]"
            aria-label="Preview month"
          />
        }
      >
        <MonthGrid month={previewMonth} workingDays={workingDays} />
      </Section>

      {/* UI-1 — live impact panel */}
      {impact && impact.items.length > 0 && (
        <Section title="Impact of unsaved changes">
          <p className="mb-3 text-[13px] text-[var(--apple-secondary-label)]">{impact.summary}</p>
          <ImpactList items={impact.items} />
        </Section>
      )}

      {/* UI-2 / UI-3 — explicit confirmation */}
      <ResponsiveDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm calendar change"
        description="These stand-ups will be affected. This cannot be undone automatically."
      >
        <div className="space-y-4">
          <ImpactList items={impact?.items ?? []} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Apply change
            </Button>
          </div>
        </div>
      </ResponsiveDialog>

      <AddOverrideDialog
        open={overrideDialogOpen}
        onOpenChange={setOverrideDialogOpen}
        projectId={projectId}
        onCreated={async () => {
          setOverrideDialogOpen(false)
          await Promise.all([loadCalendar(), loadPreview()])
        }}
      />
    </div>
  )
}

/** UI-3 — blocked dates are shown with their reason, not hidden. */
function ImpactList({ items }: { items: ImpactItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-[13px] text-[var(--apple-secondary-label)]">
        No stand-ups are affected.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={`${item.date}-${item.disposition}`}
          className={cn(
            'flex items-start gap-2.5 rounded-[var(--apple-radius-sm)] border p-2.5',
            item.blocked
              ? 'border-[var(--apple-system-red)]/30 bg-[var(--apple-system-red)]/5'
              : 'border-[var(--apple-separator)]'
          )}
        >
          {item.blocked ? (
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--apple-system-red)]" />
          ) : item.disposition === 'create' ? (
            <CalendarPlus className="mt-0.5 h-4 w-4 shrink-0 text-[var(--apple-system-green)]" />
          ) : item.disposition === 'warn_in_progress' ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--apple-system-orange)]" />
          ) : (
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[var(--apple-secondary-label)]" />
          )}
          <span className="min-w-0 flex-1">
            <span className="font-apple-mono block text-[12px] tabular-nums text-[var(--apple-tertiary-label)]">
              {item.date}
              {item.currentStatus ? ` · ${item.currentStatus}` : ''}
            </span>
            <span className="block text-[13px] text-[var(--apple-label)]">{item.message}</span>
          </span>
          {item.blocked && (
            <Badge variant="destructive" className="shrink-0">
              Blocked
            </Badge>
          )}
        </li>
      ))}
    </ul>
  )
}

function AddOverrideDialog({
  open,
  onOpenChange,
  projectId,
  onCreated
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  onCreated: () => void
}) {
  const notify = useNotify()
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [effect, setEffect] = useState<'non_working' | 'observed_as_working'>('non_working')
  const [recurringAnnually, setRecurringAnnually] = useState(false)
  const [isPartialDay, setIsPartialDay] = useState(false)
  const [hoursIfPartial, setHoursIfPartial] = useState('4')
  const [scope, setScope] = useState<'project' | 'members'>('project')
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [members, setMembers] = useState<OverrideMemberOption[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [preview, setPreview] = useState<{ items: ImpactItem[]; summary: string } | null>(null)

  // Members are only needed once the PM narrows the scope, so the fetch waits
  // for that rather than loading on every dialog open.
  useEffect(() => {
    if (!open || scope !== 'members' || members.length > 0) return

    let cancelled = false
    const run = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/member-capacity`)
        const payload = await response.json()
        if (!cancelled && response.ok) setMembers(payload.data.members)
      } catch {
        if (!cancelled) setMembers([])
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [open, scope, members.length, projectId])

  // UI-1 again: the effect of this override is shown before it is created.
  useEffect(() => {
    if (!open || !date) {
      setPreview(null)
      return
    }

    let cancelled = false
    const run = async () => {
      try {
        const response = await fetch(
          `/api/projects/${projectId}/working-calendar/preview-impact`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ change: { kind: 'override', date, effect, recurringAnnually } })
          }
        )
        const payload = await response.json()
        if (!cancelled && response.ok) {
          setPreview({ items: payload.data.items, summary: payload.data.summary })
        }
      } catch {
        if (!cancelled) setPreview(null)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [open, date, effect, recurringAnnually, projectId])

  const submit = async () => {
    setSubmitting(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/working-calendar/overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          name,
          effect,
          recurringAnnually,
          isPartialDay: partialDayAvailable && isPartialDay,
          hoursIfPartial:
            partialDayAvailable && isPartialDay ? Number(hoursIfPartial) : undefined,
          appliesToMemberIds: scope === 'members' ? selectedMemberIds : []
        })
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error?.message ?? 'Could not add the override')

      notify.success({ title: `Added "${name}"` })
      setDate('')
      setName('')
      setEffect('non_working')
      setRecurringAnnually(false)
      setIsPartialDay(false)
      setHoursIfPartial('4')
      setScope('project')
      setSelectedMemberIds([])
      onCreated()
    } catch (error) {
      notify.error({ title: 'Could not add the override', message: errorMessage(error) })
    } finally {
      setSubmitting(false)
    }
  }

  // A half day only means something on a day that is still worked. Pairing it
  // with `non_working` would be contradictory, so the control is hidden rather
  // than offered and then rejected.
  const partialDayAvailable = effect === 'observed_as_working'
  const partialHours = Number(hoursIfPartial)
  const partialHoursValid =
    !partialDayAvailable || !isPartialDay || (partialHours > 0 && partialHours < 24)

  const valid =
    date !== '' &&
    name.trim().length >= 3 &&
    partialHoursValid &&
    (scope === 'project' || selectedMemberIds.length > 0)

  const toggleMember = (memberId: string) =>
    setSelectedMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : current.concat(memberId)
    )

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add calendar override"
      description="Close a working day, or work a day the holiday calendar marks as a holiday."
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="override-date">Date</Label>
            <Input
              id="override-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="override-effect">Effect</Label>
            <Select value={effect} onValueChange={(value) => setEffect(value as typeof effect)}>
              <SelectTrigger id="override-effect">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="non_working">Non-working day</SelectItem>
                <SelectItem value="observed_as_working">Observed as working</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="override-name">Name</Label>
          <Input
            id="override-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Christmas Eve"
          />
          <p className="text-[12px] text-[var(--apple-tertiary-label)]">
            Appears on the schedule so the day numbering explains itself.
          </p>
        </div>

        {partialDayAvailable && (
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-2.5">
              <Checkbox
                checked={isPartialDay}
                onCheckedChange={(checked) => setIsPartialDay(checked === true)}
              />
              <span className="text-[13px] text-[var(--apple-label)]">
                Half day — the team works part of this day
              </span>
            </label>
            {isPartialDay && (
              <div className="space-y-1.5 pl-[26px]">
                <Label htmlFor="override-partial-hours">Hours actually worked</Label>
                <Input
                  id="override-partial-hours"
                  type="number"
                  min="0.5"
                  max="23.5"
                  step="0.5"
                  className="max-w-[140px]"
                  value={hoursIfPartial}
                  onChange={(event) => setHoursIfPartial(event.target.value)}
                />
                <p className="text-[12px] text-[var(--apple-tertiary-label)]">
                  Everyone&apos;s capacity for this date scales to this fraction of a full day.
                </p>
              </div>
            )}
          </div>
        )}

        <label className="flex cursor-pointer items-center gap-2.5">
          <Checkbox
            checked={recurringAnnually}
            onCheckedChange={(checked) => setRecurringAnnually(checked === true)}
          />
          <span className="text-[13px] text-[var(--apple-label)]">
            Repeat every year on this date
          </span>
        </label>

        <div className="space-y-2">
          <Label htmlFor="override-scope">Applies to</Label>
          <Select value={scope} onValueChange={(value) => setScope(value as typeof scope)}>
            <SelectTrigger id="override-scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="project">The whole project</SelectItem>
              <SelectItem value="members">Selected members only</SelectItem>
            </SelectContent>
          </Select>

          {scope === 'members' && (
            <div className="space-y-2">
              {/* CAL-4: a member-scoped override only reduces those people's
                  capacity. The date stays a working day and the stand-up still
                  runs, so the record of the gap exists. */}
              <Notice tone="info">
                This will not remove the working day. The stand-up still runs, and only the
                selected members lose capacity for it.
              </Notice>
              {members.length === 0 ? (
                <p className="text-[13px] text-[var(--apple-tertiary-label)]">
                  Loading team members…
                </p>
              ) : (
                <div className="max-h-[180px] space-y-1 overflow-y-auto rounded-[10px] border border-[var(--apple-separator)] p-2">
                  {members.map((member) => (
                    <label
                      key={member.memberId}
                      className="flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2 py-1.5 hover:bg-[var(--apple-fill-quaternary)]"
                    >
                      <Checkbox
                        checked={selectedMemberIds.includes(member.memberId)}
                        onCheckedChange={() => toggleMember(member.memberId)}
                      />
                      <span className="text-[13px] text-[var(--apple-label)]">
                        {memberLabel(member)}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {recurringAnnually && (
          <Notice tone="info">
            Only use this for fixed dates. Lunar holidays such as Poya days move every year and
            must come from a holiday calendar instead.
          </Notice>
        )}

        {preview && preview.items.length > 0 && (
          <div className="space-y-2">
            <p className="apple-section-label text-[var(--apple-secondary-label)]">Impact</p>
            <ImpactList items={preview.items} />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Add override
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  )
}

function MonthGrid({ month, workingDays }: { month: string; workingDays: WorkingDay[] }) {
  const byDate = useMemo(
    () => new Map(workingDays.map((day) => [day.date, day])),
    [workingDays]
  )

  const [year, monthIndex] = month.split('-').map(Number)
  const first = new Date(Date.UTC(year, monthIndex - 1, 1))
  const daysInMonth = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate()
  // Grid starts on Monday, matching the working-week control's usual shape.
  const leadingBlanks = (first.getUTCDay() + 6) % 7

  return (
    <div>
      {/* Width-capped, and sized by explicit height rather than `aspect-square`:
          unconstrained, each cell grew to a seventh of the settings panel (~130px
          tall); square cells at a comfortable width then made the month
          needlessly deep. A fixed 44px row keeps the tap target while letting the
          cells stay wider than they are tall, which is how a calendar reads. */}
      <div className="grid max-w-[480px] grid-cols-7 gap-1">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((label) => (
          <div
            key={label}
            className="apple-section-label pb-1 text-center text-[var(--apple-tertiary-label)]"
          >
            {label}
          </div>
        ))}

        {Array.from({ length: leadingBlanks }, (_, index) => (
          <div key={`blank-${index}`} />
        ))}

        {Array.from({ length: daysInMonth }, (_, index) => {
          const dayNumber = index + 1
          const date = `${month}-${String(dayNumber).padStart(2, '0')}`
          const day = byDate.get(date)
          const optional = (day?.optionalHolidays?.length ?? 0) > 0

          return (
            <div
              key={date}
              title={describeDay(day)}
              className={cn(
                'relative flex h-11 items-center justify-center rounded-[var(--apple-radius-sm)] border text-[13px] tabular-nums font-apple-mono',
                day?.isWorkingDay
                  ? 'border-[var(--apple-separator)] text-[var(--apple-label)]'
                  : 'border-transparent bg-[var(--apple-tertiary-fill)] text-[var(--apple-tertiary-label)]'
              )}
            >
              {dayNumber}
              {day && !day.isWorkingDay && day.reason !== 'weekend' && (
                <span
                  className="absolute bottom-1 h-1 w-1 rounded-full bg-[var(--apple-system-red)]"
                  aria-hidden
                />
              )}
              {optional && (
                <span
                  className="absolute bottom-1 h-1 w-1 rounded-full bg-[var(--apple-system-orange)]"
                  aria-hidden
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Colour is never the only carrier of meaning (NFR-A1). */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-[var(--apple-secondary-label)]">
        <LegendItem className="border border-[var(--apple-separator)]" label="Working day" />
        <LegendItem className="bg-[var(--apple-tertiary-fill)]" label="Weekend / non-working" />
        <LegendItem className="bg-[var(--apple-system-red)]" label="Holiday" />
        <LegendItem className="bg-[var(--apple-system-orange)]" label="Optional holiday" />
      </div>
    </div>
  )
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-2.5 w-2.5 rounded-sm', className)} aria-hidden />
      {label}
    </span>
  )
}

function describeDay(day?: WorkingDay): string {
  if (!day) return ''
  if (day.holidayName) return day.holidayName
  if (day.optionalHolidays?.length) {
    return `${day.optionalHolidays.map((h) => h.name).join(', ')} (optional)`
  }
  switch (day.reason) {
    case 'weekend':
      return 'Weekend'
    case 'project_non_working':
      return 'Project non-working day'
    case 'working':
      return day.isPartialDay ? 'Working day (partial)' : 'Working day'
    default:
      return day.reason
  }
}

function Section({
  title,
  action,
  children
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h5 className="apple-section-label text-[var(--apple-secondary-label)]">{title}</h5>
        {action}
      </div>
      {children}
    </section>
  )
}

function Notice({ tone, children }: { tone: 'info' | 'warning'; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-[var(--apple-radius-sm)] border p-3 text-[13px]',
        tone === 'warning'
          ? 'border-[var(--apple-system-orange)]/30 bg-[var(--apple-system-orange)]/5 text-[var(--apple-label)]'
          : 'border-[var(--apple-system-blue)]/30 bg-[var(--apple-system-blue)]/5 text-[var(--apple-label)]'
      )}
    >
      {tone === 'warning' ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--apple-system-orange)]" />
      ) : (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--apple-system-blue)]" />
      )}
      <span>{children}</span>
    </div>
  )
}

function CalendarSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="h-32 animate-pulse rounded-[var(--apple-radius-lg)] bg-[var(--apple-tertiary-fill)]"
        />
      ))}
    </div>
  )
}

/** Extracts a displayable message from an unknown thrown value. */
function errorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined
}

function lastDayOfMonth(month: string): string {
  const [year, monthIndex] = month.split('-').map(Number)
  const day = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate()
  return `${month}-${String(day).padStart(2, '0')}`
}

function listTimezones(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf
  if (typeof supported === 'function') {
    try {
      return supported('timeZone')
    } catch {
      // fall through
    }
  }
  return [
    'UTC',
    'Asia/Colombo',
    'Asia/Kolkata',
    'Asia/Dubai',
    'Asia/Singapore',
    'Europe/London',
    'Europe/Berlin',
    'America/New_York',
    'America/Los_Angeles',
    'Australia/Sydney'
  ]
}
