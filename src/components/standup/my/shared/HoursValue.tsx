import { formatMinutesAsHours, describeMinutes, type Minutes } from '@/lib/standup/minutes'
import { cn } from '@/lib/utils'

export type HoursValueTone = 'neutral' | 'green' | 'orange' | 'red'

const TONE_CLASSES: Record<HoursValueTone, string> = {
  neutral: 'text-[var(--apple-label)]',
  green: 'text-[var(--apple-system-green)]',
  orange: 'text-[var(--apple-system-orange)]',
  red: 'text-[var(--apple-system-red)]'
}

export interface HoursValueProps {
  minutes: Minutes
  locale?: string
  signed?: boolean
  /** When set, combined with the described value into a screen-reader label (NFR-A4). */
  label?: string
  /** Colour is never the only carrier of meaning (NFR-A1) — the figure's own digits and sign already say "over"/"under"; this only reinforces it. */
  tone?: HoursValueTone
}

/** Every hour figure on this screen renders through here — one place decides the format. */
export function HoursValue({ minutes: value, locale, signed = false, label, tone = 'neutral' }: HoursValueProps) {
  const formatted = formatMinutesAsHours(value, { locale, signed })
  const described = describeMinutes(value, locale)
  return (
    <span
      className={cn('font-apple-mono tabular-nums text-[15px]', TONE_CLASSES[tone])}
      aria-label={label ? `${label} ${described}` : described}
    >
      {formatted}
    </span>
  )
}
