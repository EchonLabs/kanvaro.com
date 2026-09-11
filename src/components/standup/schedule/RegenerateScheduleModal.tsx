'use client'

/**
 * Schedule Regeneration / Reconcile Dialog (spec SCH-10, CAL-12, UI §15.7).
 *
 * Lets a PM reconcile the sprint's stand-up days against changes in the
 * project's working calendar or sprint dates. Completed stand-ups are
 * preserved; upcoming/unstarted days are added or updated.
 */
import { useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/Dialog'
import { standupStrings } from '@/lib/standup/strings'

const { regenerate: strings } = standupStrings.schedule

export function RegenerateScheduleModal({
  sprintId,
  onReconciled
}: {
  sprintId: string
  onReconciled: () => void
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleReconcile = async () => {
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      // `reconcile` must be one of the nine real SCH-6 triggers
      // (`ReconcileTrigger` in `reconcile-rules.ts`) — `reconcileSprintSchedule`
      // branches on this value (RANGE_TRIGGERS/CLOCK_TRIGGERS) and
      // `describeTrigger` switches over it exhaustively with no default case,
      // so an invented string like the earlier 'calendar_changed' silently
      // produces an undefined description in the N10 notification. A manual
      // PM reconciliation is, in effect, "the working calendar changed since
      // this schedule was generated" — `date_became_non_working` is the real
      // trigger that covers both a holiday being added and one being removed.
      const response = await fetch(`/api/sprints/${sprintId}/standups/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reconcile: 'date_became_non_working',
          changeLabel: 'Manual PM schedule reconciliation'
        })
      })

      if (!response.ok) {
        throw new Error('Failed to reconcile')
      }

      setSuccess(true)
      setTimeout(() => {
        setOpen(false)
        setSuccess(false)
        onReconciled()
      }, 750)
    } catch {
      setError(strings.failed())
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-[13px] rounded-[var(--apple-radius-pill)] border-[var(--apple-separator)] hover:bg-[var(--apple-tertiary-fill)]"
        >
          <RefreshCw className="h-3.5 w-3.5 text-[var(--apple-secondary-label)]" />
          {strings.button()}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[460px] rounded-[var(--apple-radius-lg)]">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-semibold text-[var(--apple-label)]">
            {strings.title()}
          </DialogTitle>
          <DialogDescription className="text-[14px] text-[var(--apple-secondary-label)] mt-2">
            {strings.description()}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-[var(--apple-radius-sm)] border border-[var(--apple-system-red)]/30 bg-[var(--apple-system-red)]/[0.06] p-3 text-xs text-[var(--apple-system-red)]">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 rounded-[var(--apple-radius-sm)] border border-[var(--apple-system-green)]/30 bg-[var(--apple-system-green)]/[0.06] p-3 text-xs text-[var(--apple-system-green)]">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{strings.success()}</span>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 mt-4">
          <Button
            variant="ghost"
            disabled={loading}
            onClick={() => setOpen(false)}
            className="rounded-[var(--apple-radius-pill)]"
          >
            {strings.cancel()}
          </Button>
          <Button
            onClick={handleReconcile}
            disabled={loading || success}
            className="rounded-[var(--apple-radius-pill)] bg-[var(--apple-system-blue)] hover:bg-[var(--apple-system-blue)]/90 text-white"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                {strings.reconciling()}
              </>
            ) : (
              strings.confirm()
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
