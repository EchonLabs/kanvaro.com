'use client'

/**
 * A single planning-poker card face.
 *
 * Drawn rather than served as an image: the three poker screens each need it
 * at a different size (the arc's focused card is half again as large as a
 * revealed vote tile), and the previous ornate PNGs could not carry a value
 * legibly once scaled down to a 68px vote tile.
 *
 * The face stays cream in both themes on purpose. Every other surface here
 * follows `--plan-*` into light or dark, but a playing card is a physical
 * object in the metaphor — a card that inverts with the app theme stops
 * reading as a card. Only the accent it is picked out with is themed.
 *
 * Every proportion derives from `width`, so a caller only ever sets one
 * number and the medallion, type and corner marks scale together.
 */
import { cn } from '@/lib/utils'

const ASPECT = 1.435
/** Of the card's height. */
const MEDALLION_HEIGHT = 0.438
const MEDALLION_TYPE = 0.25

export type PokerCardTone = 'default' | 'selected' | 'muted' | 'outlier'

interface Props {
  card: string | number
  width: number
  tone?: PokerCardTone
  className?: string
  style?: React.CSSProperties
}

export function PokerCard({ card, width, tone = 'default', className, style }: Props) {
  const height = Math.round(width * ASPECT)
  const medallionHeight = Math.round(height * MEDALLION_HEIGHT)
  const medallionType = Math.round(height * MEDALLION_TYPE)
  const selected = tone === 'selected'

  // `coffee` has no short glyph that reads at a medallion's size, and '?'
  // already means "unsure" — spelling it out is the only legible option.
  const face = card === 'coffee' ? '☕' : String(card)

  return (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 flex-col items-start justify-between overflow-hidden rounded-[10px] p-[7px]',
        tone === 'muted' ? 'bg-[#CED2D6]' : 'bg-[#F5F2EA]',
        selected
          ? 'border-2 border-[var(--plan-accent)] shadow-[0_12px_28px_color-mix(in_srgb,var(--plan-accent)_40%,transparent)]'
          : tone === 'outlier'
            ? 'border border-[var(--plan-danger)]'
            : 'border border-[#AEB5C1]',
        className
      )}
      style={{ width, height, ...style }}
    >
      <span className="font-bold leading-none text-[#172033]" style={{ fontSize: 10 }}>
        {face}
      </span>
      <span
        className={cn(
          'flex w-full items-center justify-center rounded-full border',
          selected ? 'border-[var(--plan-accent)]' : 'border-[#C7C3B9]'
        )}
        style={{ height: medallionHeight }}
      >
        <span
          className="font-bold leading-none text-[#172033]"
          style={{ fontSize: medallionType }}
        >
          {face}
        </span>
      </span>
      <span
        className="w-full text-right font-bold leading-none text-[#172033]"
        style={{ fontSize: 10 }}
      >
        ◆
      </span>
    </div>
  )
}
