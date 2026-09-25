import { cn } from '@/lib/utils'

export type TagTone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'neutral'

/** Text colour plus its 12% wash — the Figma design's one badge recipe, in every accent. */
export const TAG_TONE_CLASSES: Record<TagTone, string> = {
  blue: 'bg-[var(--my-blue-tint)] text-[var(--my-blue)]',
  green: 'bg-[var(--my-green-tint)] text-[var(--my-green)]',
  amber: 'bg-[var(--my-amber-tint)] text-[var(--my-amber)]',
  red: 'bg-[var(--my-red-tint)] text-[var(--my-red)]',
  violet: 'bg-[var(--my-violet-tint)] text-[var(--my-violet)]',
  neutral: 'bg-[var(--my-raised)] text-[var(--my-muted)]'
}

export interface TagProps {
  tone: TagTone
  /** `pill` for step and stand-up states, `square` for row-level facts (status, capacity state). */
  shape?: 'pill' | 'square'
  className?: string
  children: React.ReactNode
}

/** Colour is never the only carrier of meaning (NFR-A1) — the label is the meaning; the tone reinforces it. */
export function Tag({ tone, shape = 'pill', className, children }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap px-2.5 py-1 text-[12px] font-semibold leading-none',
        shape === 'pill' ? 'rounded-full' : 'rounded-[4px]',
        TAG_TONE_CLASSES[tone],
        className
      )}
    >
      {children}
    </span>
  )
}
