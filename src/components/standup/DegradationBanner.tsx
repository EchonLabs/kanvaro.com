'use client'

import { useState } from 'react'
import { ChevronDown, Info } from 'lucide-react'

import type { Degradation, DegradationSeverity } from '@/lib/standup/degradation'
import { cn } from '@/lib/utils'

/**
 * Renders what the module cannot currently do (plan §3).
 *
 * Severity decides both prominence and whether it can be dismissed: a blocking
 * notice reports a capability the reader is about to rely on and is therefore
 * permanent and always shown, a warning is dismissible-per-session, and an
 * `info` notice — a standing configuration note, not something wrong right
 * now — collapses behind a single summary line rather than sitting expanded
 * as a full-width bar; a PM running a stand-up doesn't need "no leave
 * calendar is connected" taking up a whole row every single day.
 */
const TONE: Record<Exclude<DegradationSeverity, 'info'>, string> = {
  blocking: 'border-destructive/40 bg-destructive/10 text-foreground',
  warning: 'border-amber-500/40 bg-amber-500/10 text-foreground'
}

export function DegradationBanner({ degradations }: { degradations: Degradation[] }) {
  const [dismissed, setDismissed] = useState<string[]>([])
  const [infoExpanded, setInfoExpanded] = useState(false)

  const prominent = degradations
    .filter((d) => d.severity !== 'info')
    .filter((d) => d.severity === 'blocking' || !dismissed.includes(d.code))
    .sort((a, b) => (a.severity === 'blocking' ? 0 : 1) - (b.severity === 'blocking' ? 0 : 1))

  const info = degradations.filter((d) => d.severity === 'info' && !dismissed.includes(d.code))

  if (prominent.length === 0 && info.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {prominent.map((degradation) => (
        <div
          key={degradation.code}
          role={degradation.severity === 'blocking' ? 'alert' : 'status'}
          className={cn(
            'flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm',
            TONE[degradation.severity as Exclude<DegradationSeverity, 'info'>]
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

      {info.length > 0 && (
        <div className="rounded-md border border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)]">
          <button
            type="button"
            onClick={() => setInfoExpanded((current) => !current)}
            aria-expanded={infoExpanded}
            className="apple-transition flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]"
          >
            <Info className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            <span className="flex-1">
              {info.length === 1 ? '1 configuration notice' : `${info.length} configuration notices`}
            </span>
            <ChevronDown
              className={cn('h-3.5 w-3.5 shrink-0 apple-transition', infoExpanded && 'rotate-180')}
              strokeWidth={2}
            />
          </button>

          {infoExpanded && (
            <div className="flex flex-col gap-1.5 border-t border-[var(--apple-separator)] px-3 py-2">
              {info.map((degradation) => (
                <div
                  key={degradation.code}
                  role="status"
                  data-testid="degradation-message"
                  className="flex items-start justify-between gap-3 text-[12.5px] text-[var(--apple-secondary-label)]"
                >
                  <p className="flex-1">{degradation.message}</p>
                  <div className="flex shrink-0 items-center gap-3">
                    {degradation.action ? (
                      <a
                        href={degradation.action.href}
                        className="font-medium text-[var(--apple-system-blue)] underline underline-offset-2"
                      >
                        {degradation.action.label}
                      </a>
                    ) : null}
                    <button
                      type="button"
                      aria-label="Dismiss"
                      className="hover:text-[var(--apple-label)]"
                      onClick={() => setDismissed((prev) => [...prev, degradation.code])}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
