import { Tag, type TagTone } from './Tag'

export interface JourneyStepProps {
  step: number
  title: string
  subtitle: string
  /** The step's state pill, top right. Omitted when the step has nothing to report (e.g. its data failed to load). */
  state?: { label: string; tone: TagTone }
  children: React.ReactNode
}

/** One numbered card of the guided journey — the shell every section of the redesign shares. */
export function JourneyStep({ step, title, subtitle, state, children }: JourneyStepProps) {
  const headingId = `my-standup-step-${step}`
  return (
    <section
      aria-labelledby={headingId}
      className="flex w-full flex-col gap-5 rounded-2xl border border-[var(--my-border)] bg-[var(--my-surface)] p-4 sm:p-6"
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--my-blue-tint)] text-[12px] font-bold text-[var(--my-blue)]"
          >
            {step}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id={headingId} className="text-[18px] font-bold text-[var(--my-text)]">
              {title}
            </h2>
            <p className="text-[13px] text-[var(--my-muted)]">{subtitle}</p>
          </div>
        </div>
        {state ? <Tag tone={state.tone}>{state.label}</Tag> : null}
      </header>
      {children}
    </section>
  )
}

/** The small uppercase label that heads a list inside a step ("Active roadblocks", "Read-only carry forward…"). */
export function JourneyEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13px] font-semibold uppercase text-[var(--my-subtle)]">{children}</p>
  )
}

/** A section's own load-failure / empty sentence, in the design's secondary text. */
export function JourneyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] leading-5 text-[var(--my-muted)]">{children}</p>
}
