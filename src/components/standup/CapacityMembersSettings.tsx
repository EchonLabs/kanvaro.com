'use client'

/**
 * Capacity and Members screen (spec §15.4).
 *
 * This is the number the stand-up board holds a PM to every day, so the copy
 * pushes honesty over aspiration: someone working four hours should be set to
 * four, not eight with a daily override.
 *
 * DAT-1 is visible in the interface, not just the schema. Changing capacity
 * takes effect from a date and leaves earlier stand-ups resolving the hours that
 * applied then, which the "effective from" control makes explicit.
 */
import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Info, Loader2, Plus, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { useNotify } from '@/lib/notify'

interface Commitment {
  label: string
  minutesPerDay: number
  daysOfWeek: number[]
}

interface MemberRow {
  memberId: string
  firstName?: string
  lastName?: string
  email?: string
  dailyCapacityMinutes: number
  dailyCapacityHours: number
  isDefault: boolean
  effectiveFrom?: string
  nonProjectCommitments: Commitment[]
}

export function CapacityMembersSettings({ projectId }: { projectId: string }) {
  const notify = useNotify()
  const [members, setMembers] = useState<MemberRow[]>([])
  const [projectStandardMinutes, setProjectStandardMinutes] = useState(480)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<MemberRow | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/member-capacity`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error?.message)

      setMembers(payload.data.members)
      setProjectStandardMinutes(payload.data.projectStandardMinutes)
    } catch (error) {
      notify.error({
        title: 'Could not load member capacity',
        message: error instanceof Error ? error.message : undefined
      })
    } finally {
      setLoading(false)
    }
  }, [projectId, notify])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <CapacitySkeleton />

  return (
    <div className="space-y-5">
      <header>
        <h4 className="text-[17px] font-semibold text-[var(--apple-label)]">
          Capacity and Members
        </h4>
        <p className="text-[13px] text-[var(--apple-secondary-label)]">
          The hours the stand-up board will hold you to every day. Set real availability, not
          aspiration.
        </p>
      </header>

      {members.length === 0 ? (
        <div className="rounded-[var(--apple-radius-lg)] border border-dashed border-[var(--apple-separator)] p-8 text-center">
          <p className="text-[14px] text-[var(--apple-secondary-label)]">
            This project has no team members yet.
          </p>
          <p className="mt-1 text-[13px] text-[var(--apple-tertiary-label)]">
            Add people on the Team tab, then set their daily capacity here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-[var(--apple-separator)]">
                <Th>Member</Th>
                <Th align="right">Daily capacity</Th>
                <Th>Effective from</Th>
                <Th>Commitments</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr
                  key={member.memberId}
                  className="border-b border-[var(--apple-separator)] last:border-0"
                >
                  <td className="px-4 py-3">
                    <span className="block text-[14px] font-medium text-[var(--apple-label)]">
                      {[member.firstName, member.lastName].filter(Boolean).join(' ') ||
                        member.email}
                    </span>
                    {member.email && (
                      <span className="block text-[12px] text-[var(--apple-tertiary-label)]">
                        {member.email}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right">
                    <span className="font-apple-mono text-[14px] tabular-nums text-[var(--apple-label)]">
                      {member.dailyCapacityHours.toFixed(1)}h
                    </span>
                    {member.isDefault && (
                      <Badge variant="secondary" className="ml-2">
                        Default
                      </Badge>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <span className="font-apple-mono text-[13px] tabular-nums text-[var(--apple-secondary-label)]">
                      {member.effectiveFrom ?? '—'}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    {member.nonProjectCommitments.length === 0 ? (
                      <span className="text-[13px] text-[var(--apple-tertiary-label)]">None</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {member.nonProjectCommitments.map((commitment) => (
                          <Badge key={commitment.label} variant="secondary">
                            {commitment.label} · {(commitment.minutesPerDay / 60).toFixed(1)}h
                          </Badge>
                        ))}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right">
                    <Button variant="outline" size="sm" onClick={() => setEditing(member)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="flex items-start gap-2 text-[12px] text-[var(--apple-tertiary-label)]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Project standard day is {(projectStandardMinutes / 60).toFixed(1)}h. Members marked
        &ldquo;Default&rdquo; inherit it.
      </p>

      {editing && (
        <EditCapacityDialog
          projectId={projectId}
          member={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await load()
          }}
        />
      )}
    </div>
  )
}

function EditCapacityDialog({
  projectId,
  member,
  onClose,
  onSaved
}: {
  projectId: string
  member: MemberRow
  onClose: () => void
  onSaved: () => void
}) {
  const notify = useNotify()
  const [hours, setHours] = useState(member.dailyCapacityHours)
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10))
  const [commitments, setCommitments] = useState(
    member.nonProjectCommitments.map((commitment) => ({
      label: commitment.label,
      hoursPerDay: commitment.minutesPerDay / 60,
      daysOfWeek: commitment.daysOfWeek
    }))
  )
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/member-capacity`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: member.memberId,
          dailyCapacityHours: hours,
          effectiveFrom,
          nonProjectCommitments: commitments
        })
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error?.message)

      notify.success({ title: 'Capacity updated' })
      onSaved()
    } catch (error) {
      notify.error({
        title: 'Could not update capacity',
        message: error instanceof Error ? error.message : undefined
      })
    } finally {
      setSaving(false)
    }
  }

  const name =
    [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email || 'member'

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Capacity for ${name}`}
      description="Set real availability. A person working four hours a day should be set to four."
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="capacity-hours">Daily capacity (hours)</Label>
            <Input
              id="capacity-hours"
              type="number"
              min={0}
              max={24}
              step={0.25}
              value={hours}
              onChange={(event) => setHours(Number(event.target.value))}
              className="font-apple-mono tabular-nums"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="effective-from">Effective from</Label>
            <Input
              id="effective-from"
              type="date"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
            />
          </div>
        </div>

        {/* DAT-1 made visible: history is preserved, not rewritten. */}
        <p className="flex items-start gap-2 rounded-[var(--apple-radius-sm)] border border-[var(--apple-system-blue)]/30 bg-[var(--apple-system-blue)]/5 p-3 text-[12px] text-[var(--apple-label)]">
          <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--apple-system-blue)]" />
          Stand-ups before this date keep the capacity that applied then, so past variance stays
          accurate.
        </p>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Non-project commitments</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setCommitments([...commitments, { label: '', hoursPerDay: 1, daysOfWeek: [] }])
              }
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add
            </Button>
          </div>

          {commitments.length === 0 ? (
            <p className="text-[12px] text-[var(--apple-tertiary-label)]">
              For example a daily support rota that eats into project time.
            </p>
          ) : (
            commitments.map((commitment, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label htmlFor={`commitment-label-${index}`} className="text-[12px]">
                    Label
                  </Label>
                  <Input
                    id={`commitment-label-${index}`}
                    value={commitment.label}
                    placeholder="Support rota"
                    onChange={(event) =>
                      setCommitments(
                        commitments.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, label: event.target.value } : item
                        )
                      )
                    }
                  />
                </div>
                <div className="w-28 space-y-1.5">
                  <Label htmlFor={`commitment-hours-${index}`} className="text-[12px]">
                    Hours/day
                  </Label>
                  <Input
                    id={`commitment-hours-${index}`}
                    type="number"
                    min={0}
                    max={24}
                    step={0.25}
                    value={commitment.hoursPerDay}
                    onChange={(event) =>
                      setCommitments(
                        commitments.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, hoursPerDay: Number(event.target.value) }
                            : item
                        )
                      )
                    }
                    className="font-apple-mono tabular-nums"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setCommitments(commitments.filter((_, itemIndex) => itemIndex !== index))
                  }
                  aria-label={`Remove commitment ${commitment.label || index + 1}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save capacity
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  )
}

function Th({
  children,
  align = 'left'
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <th
      scope="col"
      className={`apple-section-label px-4 py-2.5 text-[var(--apple-tertiary-label)] ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}

function CapacitySkeleton() {
  return (
    <div className="space-y-3" aria-busy>
      <div className="h-8 w-48 animate-pulse rounded bg-[var(--apple-tertiary-fill)]" />
      <div className="h-64 animate-pulse rounded-[var(--apple-radius-lg)] bg-[var(--apple-tertiary-fill)]" />
    </div>
  )
}
