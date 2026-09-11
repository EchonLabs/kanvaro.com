import { formatMinutesAsHours, describeMinutes, type Minutes } from '@/lib/standup/minutes'

export interface HoursValueProps {
  minutes: Minutes
  locale?: string
  signed?: boolean
  /** When set, combined with the described value into a screen-reader label (NFR-A4). */
  label?: string
}

/** Every hour figure on this screen renders through here — one place decides the format. */
export function HoursValue({ minutes: value, locale, signed = false, label }: HoursValueProps) {
  const formatted = formatMinutesAsHours(value, { locale, signed })
  const described = describeMinutes(value, locale)
  return (
    <span
      className="font-apple-mono tabular-nums text-[15px] text-[var(--apple-label)]"
      aria-label={label ? `${label} ${described}` : described}
    >
      {formatted}
    </span>
  )
}
