import { HoursValue } from './HoursValue'
import type { Minutes } from '@/lib/standup/minutes'

export interface TaskRowProps {
  taskKey?: string
  title: string
  plannedMinutes?: Minutes
  loggedMinutes?: Minutes
  trailing?: React.ReactNode
  locale?: string
}

/** The shared row shape used by Yesterday and Today's plan alike. */
export function TaskRow({ taskKey, title, plannedMinutes, loggedMinutes, trailing, locale }: TaskRowProps) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[15px] font-medium text-[var(--apple-label)]">{title}</span>
        {taskKey ? (
          <span className="font-apple-mono text-[13px] text-[var(--apple-tertiary-label)]">{taskKey}</span>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        {plannedMinutes !== undefined ? (
          <HoursValue minutes={plannedMinutes} locale={locale} label="Planned" />
        ) : null}
        {loggedMinutes !== undefined ? (
          <HoursValue minutes={loggedMinutes} locale={locale} label="Logged" />
        ) : null}
        {trailing}
      </div>
    </div>
  )
}
