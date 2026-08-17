'use client'

/**
 * The points-to-hours migration dialog (spec PLN-14, E17).
 *
 * PLN-14 forbids a silent recompute, so this exists to make the consequence
 * visible before it happens: every task that would change, with its old and new
 * hours, and every task that is deliberately being left alone with the reason.
 *
 * The excluded list is not padding. A PM who changes the factor and later finds
 * one sprint on different numbers needs to have been told *here* that completed
 * sprints and frozen estimates were skipped — otherwise it reads as a bug.
 */
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Lock } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { useNotify } from '@/lib/notify'

interface AffectedTask {
  id: string
  key?: string
  title?: string
  estimateValue: number
  currentMinutes: number
  proposedMinutes: number
  deltaMinutes: number
  sprintName?: string
}

interface ExcludedTask {
  id: string
  key?: string
  title?: string
  reason: 'completed_sprint' | 'estimate_frozen'
  sprintName?: string
}

interface Preview {
  currentFactor: number
  proposedFactor: number
  affected: AffectedTask[]
  excluded: ExcludedTask[]
  totalDeltaMinutes: number
  noop: boolean
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  proposedFactor: number
  onApplied: () => void
}

const hours = (minutes: number) => (minutes / 60).toFixed(1)
const signed = (minutes: number) => `${minutes > 0 ? '+' : ''}${hours(minutes)}h`

const EXCLUSION_REASONS: Record<ExcludedTask['reason'], string> = {
  completed_sprint: 'In a completed sprint',
  estimate_frozen: 'Estimate frozen at planning'
}

export function PointsMigrationDialog({
  open,
  onOpenChange,
  projectId,
  proposedFactor,
  onApplied
}: Props) {
  const notify = useNotify()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/projects/${projectId}/standup-settings/points-migration`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pointsToHours: proposedFactor })
        }
      )
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error?.message ?? 'Could not preview the change')

      setPreview(payload.data)
      // Everything eligible is ticked by default: the PM asked for this change,
      // so the common case is one click. Unticking is the exception.
      setSelected(payload.data.affected.map((task: AffectedTask) => task.id))
    } catch (error) {
      notify.error({
        title: 'Could not preview the change',
        message: error instanceof Error ? error.message : undefined
      })
    } finally {
      setLoading(false)
    }
  }, [projectId, proposedFactor, notify])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const apply = async () => {
    setApplying(true)
    try {
      const response = await fetch(
        `/api/projects/${projectId}/standup-settings/points-migration`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pointsToHours: proposedFactor, confirmedTaskIds: selected })
        }
      )
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error?.message ?? 'Could not apply the change')

      notify.success({
        title: `${payload.data.updated} ${payload.data.updated === 1 ? 'task' : 'tasks'} reconverted`
      })
      onApplied()
      onOpenChange(false)
    } catch (error) {
      notify.error({
        title: 'Could not apply the change',
        message: error instanceof Error ? error.message : undefined
      })
    } finally {
      setApplying(false)
    }
  }

  const toggle = (taskId: string) =>
    setSelected((current) =>
      current.includes(taskId)
        ? current.filter((id) => id !== taskId)
        : current.concat(taskId)
    )

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Change the story point conversion"
      description={
        preview
          ? `${preview.currentFactor}h per point becomes ${preview.proposedFactor}h per point.`
          : 'Working out what this would change…'
      }
    >
      <div className="space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-[13px] text-[var(--apple-secondary-label)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking existing estimates…
          </div>
        )}

        {preview?.noop && (
          <p className="text-[13px] text-[var(--apple-secondary-label)]">
            No existing estimate would change. The new factor applies to estimates made from now
            on.
          </p>
        )}

        {preview && preview.affected.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="apple-section-label text-[var(--apple-secondary-label)]">
                {preview.affected.length} tasks would be reconverted
              </p>
              <span className="font-apple-mono text-[13px] tabular-nums text-[var(--apple-label)]">
                {signed(preview.totalDeltaMinutes)} total
              </span>
            </div>

            <div className="max-h-[260px] space-y-1 overflow-y-auto rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] p-2">
              {preview.affected.map((task) => (
                <label
                  key={task.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2 py-1.5 hover:bg-[var(--apple-fill-quaternary)]"
                >
                  <Checkbox
                    checked={selected.includes(task.id)}
                    onCheckedChange={() => toggle(task.id)}
                  />
                  <span className="font-apple-mono text-[12px] text-[var(--apple-system-blue)]">
                    {task.key}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--apple-label)]">
                    {task.title}
                  </span>
                  <span className="font-apple-mono text-[12px] tabular-nums text-[var(--apple-secondary-label)]">
                    {task.estimateValue}pt · {hours(task.currentMinutes)}h →{' '}
                    {hours(task.proposedMinutes)}h
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {preview && preview.excluded.length > 0 && (
          <div className="space-y-2">
            <p className="apple-section-label text-[var(--apple-secondary-label)]">
              {preview.excluded.length} left unchanged
            </p>
            <div className="space-y-1 rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)]/40 p-2">
              {preview.excluded.slice(0, 8).map((task) => (
                <div key={task.id} className="flex items-center gap-2 px-2 py-1 text-[12px]">
                  <Lock className="h-3 w-3 shrink-0 text-[var(--apple-tertiary-label)]" />
                  <span className="font-apple-mono text-[var(--apple-secondary-label)]">
                    {task.key}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {EXCLUSION_REASONS[task.reason]}
                  </Badge>
                </div>
              ))}
              {preview.excluded.length > 8 && (
                <p className="px-2 text-[12px] text-[var(--apple-tertiary-label)]">
                  and {preview.excluded.length - 8} more
                </p>
              )}
            </div>
          </div>
        )}

        {preview && preview.affected.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-[var(--apple-radius-sm)] border border-[var(--apple-system-orange)]/30 bg-[var(--apple-system-orange)]/5 p-3 text-[13px]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--apple-system-orange)]" />
            <span>
              This rewrites the original estimate on the ticked tasks. Sprint reports for those
              tasks will show the new number.
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
            Cancel
          </Button>
          <Button
            onClick={apply}
            disabled={applying || loading || (!preview?.noop && selected.length === 0)}
          >
            {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {preview?.noop
              ? 'Save the new factor'
              : `Reconvert ${selected.length} and save`}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  )
}
