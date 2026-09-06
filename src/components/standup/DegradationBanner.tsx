'use client'

import { useState } from 'react'

import type { Degradation, DegradationSeverity } from '@/lib/standup/degradation'
import { cn } from '@/lib/utils'

/**
 * Renders what the module cannot currently do (plan §3).
 *
 * Severity decides both prominence and whether it can be dismissed: a blocking
 * notice reports a capability the reader is about to rely on and is therefore
 * permanent, while an informational one is a standing configuration note that
 * should not nag.
 */
const ORDER: Record<DegradationSeverity, number> = { blocking: 0, warning: 1, info: 2 }

const TONE: Record<DegradationSeverity, string> = {
  blocking: 'border-destructive/40 bg-destructive/10 text-foreground',
  warning: 'border-amber-500/40 bg-amber-500/10 text-foreground',
  info: 'border-border bg-muted/50 text-muted-foreground'
}

export function DegradationBanner({ degradations }: { degradations: Degradation[] }) {
  const [dismissed, setDismissed] = useState<string[]>([])

  const visible = degradations
    .filter((d) => d.severity === 'blocking' || !dismissed.includes(d.code))
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity])

  if (visible.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {visible.map((degradation) => (
        <div
          key={degradation.code}
          role={degradation.severity === 'blocking' ? 'alert' : 'status'}
          className={cn(
            'flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm',
            TONE[degradation.severity]
          )}
        >
          <p data-testid="degradation-message" className="flex-1">
            {degradation.message}
          </p>

          <div className="flex shrink-0 items-center gap-3">
            {degradation.action ? (
              <a
                href={degradation.action.href}
                className="font-medium underline underline-offset-2"
              >
                {degradation.action.label}
              </a>
            ) : null}

            {degradation.severity !== 'blocking' ? (
              <button
                type="button"
                aria-label="Dismiss"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setDismissed((prev) => [...prev, degradation.code])}
              >
                ×
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}
