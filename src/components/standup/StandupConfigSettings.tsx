'use client'

/**
 * Stand-up Configuration screen (spec §15.3).
 *
 * The overrun policy is the single most consequential setting here, so it gets
 * the full explanatory copy the spec asks for rather than a bare radio pair — a
 * PM choosing between "absorb" and "reduce" is choosing whether tomorrow's plan
 * is aspirational or honest, and that is not inferable from the label.
 */
import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useNotify } from '@/lib/notify'
import { cn } from '@/lib/utils'

interface Settings {
  enabled: boolean
  standupLocalTime: string
  durationMinutes: number
  readyLeadMinutes: number
  reminderLeadMinutes: number
  meetingUrl?: string
  overrunPolicy: 'absorb' | 'reduce'
  underToleranceHours: number
  overToleranceHours: number
  carryForwardNoteThreshold: number
  carryForwardEscalationThreshold: number
  reopenWindowHours: number
  backfillWindowWorkingDays: number
  allowSelfSelect: boolean
  allowMemberPreEdit: boolean
  carryDebtBetweenSprints: boolean
  crossSprintCarryForward: boolean
  blockedTasksConsumeCapacity: boolean
  requireOverAllocationAck: boolean
  pointsToHours: number
}

export function StandupConfigSettings({ projectId }: { projectId: string }) {
  const notify = useNotify()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/standup-settings`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error?.message)
      setSettings(payload.data.settings)
    } catch (error) {
      notify.error({
        title: 'Could not load stand-up settings',
        message: error instanceof Error ? error.message : undefined
      })
    } finally {
      setLoading(false)
    }
  }, [projectId, notify])

  useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/standup-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error?.message)

      setSettings(payload.data.settings)
      notify.success({ title: 'Stand-up settings saved' })
    } catch (error) {
      notify.error({
        title: 'Could not save stand-up settings',
        message: error instanceof Error ? error.message : undefined
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <ConfigSkeleton />
  if (!settings) return null

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings({ ...settings, [key]: value })

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-[17px] font-semibold text-[var(--apple-label)]">
            Stand-up Configuration
          </h4>
          <p className="text-[13px] text-[var(--apple-secondary-label)]">
            When the stand-up runs, and the rules it holds the team to.
          </p>
        </div>
        <Button onClick={save} disabled={saving} size="sm">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save settings
        </Button>
      </header>

      <Section title="Stand-ups">
        <ToggleRow
          label="Stand-ups enabled"
          hint="Off means no stand-ups are generated for future sprints on this project."
          checked={settings.enabled}
          onChange={(value) => update('enabled', value)}
        />
      </Section>

      <Section title="Schedule">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Stand-up time"
            hint="Project local time"
            type="time"
            value={settings.standupLocalTime}
            onChange={(value) => update('standupLocalTime', value)}
          />
          <NumberField
            label="Duration"
            hint="Minutes"
            min={5}
            max={60}
            value={settings.durationMinutes}
            onChange={(value) => update('durationMinutes', value)}
          />
          <NumberField
            label="Ready lead time"
            hint="Minutes before, when the snapshot is built"
            min={5}
            max={120}
            value={settings.readyLeadMinutes}
            onChange={(value) => update('readyLeadMinutes', value)}
          />
          <NumberField
            label="Reminder lead time"
            hint="Minutes before. 0 disables."
            min={0}
            max={1440}
            value={settings.reminderLeadMinutes}
            onChange={(value) => update('reminderLeadMinutes', value)}
          />
        </div>

        <div className="mt-4">
          <Field
            label="Meeting URL"
            hint="Shown as a Join button on the run screen"
            type="url"
            value={settings.meetingUrl ?? ''}
            onChange={(value) => update('meetingUrl', value)}
          />
        </div>
      </Section>

      {/* The setting that changes how the whole module behaves. */}
      <Section title="Overrun policy">
        <div className="grid gap-3 sm:grid-cols-2">
          <PolicyCard
            selected={settings.overrunPolicy === 'absorb'}
            onSelect={() => update('overrunPolicy', 'absorb')}
            title="Absorb"
            summary="Capacity stays at full tomorrow."
            detail="When someone goes over estimate, their day tomorrow is still eight hours and the overrun shows as estimate debt they are expected to make up. Choose this if your culture is that the estimate is the commitment."
          />
          <PolicyCard
            selected={settings.overrunPolicy === 'reduce'}
            onSelect={() => update('overrunPolicy', 'reduce')}
            title="Reduce"
            summary="Tomorrow's capacity drops by the overrun."
            detail="Burn two hours over and the board will only let you plan six hours of new work. Choose this if you want the plan to reflect reality rather than intention."
          />
        </div>
        <p className="mt-3 text-[12px] text-[var(--apple-tertiary-label)]">
          Changing this only affects stand-ups that have not been completed.
        </p>
      </Section>

      <Section title="Capacity tolerances">
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Under-allocation tolerance"
            hint="Hours. A gap smaller than this still counts as full."
            min={0}
            max={2}
            step={0.25}
            value={settings.underToleranceHours}
            onChange={(value) => update('underToleranceHours', value)}
          />
          <NumberField
            label="Over-allocation tolerance"
            hint="Hours"
            min={0}
            max={2}
            step={0.25}
            value={settings.overToleranceHours}
            onChange={(value) => update('overToleranceHours', value)}
          />
        </div>
      </Section>

      <Section title="Carry forward">
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Note threshold"
            hint="Stand-ups an item may age before a note is mandatory"
            min={1}
            max={10}
            value={settings.carryForwardNoteThreshold}
            onChange={(value) => update('carryForwardNoteThreshold', value)}
          />
          <NumberField
            label="Escalation threshold"
            hint="Must exceed the note threshold"
            min={1}
            max={20}
            value={settings.carryForwardEscalationThreshold}
            onChange={(value) => update('carryForwardEscalationThreshold', value)}
          />
        </div>
      </Section>

      <Section title="Windows">
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Reopen window"
            hint="Hours after completion. 0 disables reopening."
            min={0}
            max={120}
            value={settings.reopenWindowHours}
            onChange={(value) => update('reopenWindowHours', value)}
          />
          <NumberField
            label="Back-fill window"
            hint="Working days, for missed stand-ups"
            min={0}
            max={5}
            value={settings.backfillWindowWorkingDays}
            onChange={(value) => update('backfillWindowWorkingDays', value)}
          />
        </div>
      </Section>

      <Section title="Behaviour">
        <div className="space-y-1">
          <ToggleRow
            label="Allow self-select"
            hint="Members may pull extra work into their own day."
            checked={settings.allowSelfSelect}
            onChange={(value) => update('allowSelfSelect', value)}
          />
          <ToggleRow
            label="Allow member pre-edit"
            hint="Members may adjust their own rows while the stand-up is Ready."
            checked={settings.allowMemberPreEdit}
            onChange={(value) => update('allowMemberPreEdit', value)}
          />
          <ToggleRow
            label="Blocked tasks consume capacity"
            hint="Off means blocked work frees capacity, opening a gap you need to fill."
            checked={settings.blockedTasksConsumeCapacity}
            onChange={(value) => update('blockedTasksConsumeCapacity', value)}
          />
          <ToggleRow
            label="Require acknowledgement on over-allocation"
            hint="The PM must confirm they have discussed it with the member."
            checked={settings.requireOverAllocationAck}
            onChange={(value) => update('requireOverAllocationAck', value)}
          />
          <ToggleRow
            label="Carry debt between sprints"
            hint="Off keeps estimate debt a within-sprint planning signal."
            checked={settings.carryDebtBetweenSprints}
            onChange={(value) => update('carryDebtBetweenSprints', value)}
          />
          <ToggleRow
            label="Cross-sprint carry forward"
            hint="Brings unfinished items from the previous sprint into day one."
            checked={settings.crossSprintCarryForward}
            onChange={(value) => update('crossSprintCarryForward', value)}
          />
        </div>
      </Section>

      <Section title="Estimation">
        <NumberField
          label="Points to hours"
          hint="Conversion factor when estimating in story points"
          min={0.5}
          max={40}
          step={0.5}
          value={settings.pointsToHours}
          onChange={(value) => update('pointsToHours', value)}
        />
      </Section>
    </div>
  )
}

function PolicyCard({
  selected,
  onSelect,
  title,
  summary,
  detail
}: {
  selected: boolean
  onSelect: () => void
  title: string
  summary: string
  detail: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'apple-transition rounded-[var(--apple-radius-md)] border p-4 text-left',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-system-blue)]',
        selected
          ? 'border-[var(--apple-system-blue)] bg-[var(--apple-system-blue)]/5'
          : 'border-[var(--apple-separator)] hover:bg-[var(--apple-quaternary-fill)]'
      )}
    >
      <span className="flex items-center gap-2">
        <span
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
            selected
              ? 'border-[var(--apple-system-blue)]'
              : 'border-[var(--apple-tertiary-label)]'
          )}
          aria-hidden
        >
          {selected && (
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--apple-system-blue)]" />
          )}
        </span>
        <span className="text-[15px] font-semibold text-[var(--apple-label)]">{title}</span>
      </span>
      <span className="mt-1.5 block text-[13px] font-medium text-[var(--apple-label)]">
        {summary}
      </span>
      <span className="mt-1 block text-[12px] leading-relaxed text-[var(--apple-secondary-label)]">
        {detail}
      </span>
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none">
      <h5 className="apple-section-label mb-3 text-[var(--apple-secondary-label)]">{title}</h5>
      {children}
    </section>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="min-w-0">
        <span className="block text-[14px] text-[var(--apple-label)]">{label}</span>
        <span className="block text-[12px] text-[var(--apple-tertiary-label)]">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  )
}

function Field({
  label,
  hint,
  type,
  value,
  onChange
}: {
  label: string
  hint?: string
  type: string
  value: string
  onChange: (value: string) => void
}) {
  const id = `field-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
      {hint && <p className="text-[12px] text-[var(--apple-tertiary-label)]">{hint}</p>}
    </div>
  )
}

function NumberField({
  label,
  hint,
  min,
  max,
  step = 1,
  value,
  onChange
}: {
  label: string
  hint?: string
  min: number
  max: number
  step?: number
  value: number
  onChange: (value: number) => void
}) {
  const id = `number-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="font-apple-mono tabular-nums"
      />
      {hint && <p className="text-[12px] text-[var(--apple-tertiary-label)]">{hint}</p>}
    </div>
  )
}

function ConfigSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          className="h-28 animate-pulse rounded-[var(--apple-radius-lg)] bg-[var(--apple-tertiary-fill)]"
        />
      ))}
    </div>
  )
}
