'use client'

/**
 * The planning-poker card fan (PLN-11 popup redesign).
 *
 * Browse only, no implicit vote: dragging, scrolling, and clicking a card all
 * just move `centerIndex` and report the settled card via `onPick` — none of
 * them cast a vote. A prior single-click-votes design conflated "this card is
 * centered" with "I voted for this card," which meant there was no way to
 * browse the deck without every click being read as a commitment. The actual
 * vote now happens from an explicit "Confirm" control the parent renders
 * outside this component; this component only ever reports candidates.
 *
 * Each card rotates around a shared pivot point far below the fan
 * (`transform-origin` + `rotate()`), which is what produces the hand-of-cards
 * arc — no separate horizontal offset math is needed, unlike the previous
 * `translateX`-per-offset layout.
 *
 * `centerIndex` is a float so drag/wheel input can move it continuously;
 * `focusedIndex` (its rounded value) is what decides which single card is
 * "big" and which one settling reports as the candidate.
 */
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import { PokerCard } from './PokerCard'

const FOCUSED_CARD_WIDTH = 92
const CARD_PIVOT_RADIUS = 620
const ROTATION_DEG_PER_OFFSET = 8
const ROTATION_MAX_DEG = 26
const FOCUS_LIFT_PX = 10
const DRAG_PX_PER_CARD = 90
const WHEEL_UNITS_PER_CARD = 140
const DRAG_CLICK_THRESHOLD_PX = 6
const WHEEL_SETTLE_MS = 140
const PANEL_HEIGHT = 232

interface Props {
  cards: Array<string | number>
  selected: string | number | null
  disabled?: boolean
  onPick: (card: string | number) => void
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/**
 * Scale falls off with distance from center; beyond this it's fully cropped.
 * The steps match the design's own card widths (92 focused, then 76 / 74 / 70).
 */
function scaleForOffset(offset: number): number {
  const magnitude = Math.abs(offset)
  if (magnitude >= 3) return 0
  if (magnitude >= 2) return 0.76
  if (magnitude >= 1) return 0.82
  return 1
}

function opacityForOffset(offset: number): number {
  const magnitude = Math.abs(offset)
  if (magnitude >= 3) return 0
  if (magnitude >= 2.4) return 1 - (magnitude - 2.4) / 0.6
  return 1
}

/** Degrees to rotate a card around the shared pivot, clamped so far-offset
 * (already near-invisible) cards don't spin past a sane amount. */
function rotationForOffset(offset: number): number {
  return clamp(offset * ROTATION_DEG_PER_OFFSET, -ROTATION_MAX_DEG, ROTATION_MAX_DEG)
}

function cardAltText(card: string | number): string {
  if (card === '?') return 'Unsure card'
  if (card === 'coffee') return 'Coffee break card'
  return `Card ${card}`
}

export function PokerCardCarousel({ cards, selected, disabled, onPick }: Props) {
  const selectedIndex = cards.findIndex((card) => card === selected)
  const initialIndex = selectedIndex >= 0 ? selectedIndex : Math.floor((cards.length - 1) / 2)
  const [centerIndex, setCenterIndex] = useState(initialIndex)
  const [dragging, setDragging] = useState(false)

  const dragState = useRef<{ startX: number; startIndex: number; moved: number } | null>(null)
  const wheelSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const focusedIndex = clamp(Math.round(centerIndex), 0, cards.length - 1)

  useEffect(() => {
    return () => {
      if (wheelSettleTimer.current) clearTimeout(wheelSettleTimer.current)
    }
  }, [])

  const goTo = (index: number) => setCenterIndex(clamp(index, 0, cards.length - 1))

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
    dragState.current = { startX: event.clientX, startIndex: centerIndex, moved: 0 }
    setDragging(true)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragState.current
    if (!state) return
    const deltaX = event.clientX - state.startX
    state.moved = Math.max(state.moved, Math.abs(deltaX))
    setCenterIndex(clamp(state.startIndex - deltaX / DRAG_PX_PER_CARD, 0, cards.length - 1))
  }

  const endDrag = () => {
    dragState.current = null
    setDragging(false)
    setCenterIndex((current) => {
      const rounded = clamp(Math.round(current), 0, cards.length - 1)
      onPick(cards[rounded])
      return rounded
    })
  }

  const handlePointerUp = () => endDrag()
  const handlePointerCancel = () => endDrag()

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (disabled) return
    event.preventDefault()
    setDragging(true)
    setCenterIndex((current) =>
      clamp(current + event.deltaY / WHEEL_UNITS_PER_CARD, 0, cards.length - 1)
    )
    if (wheelSettleTimer.current) clearTimeout(wheelSettleTimer.current)
    wheelSettleTimer.current = setTimeout(() => {
      setDragging(false)
      setCenterIndex((current) => {
        const rounded = clamp(Math.round(current), 0, cards.length - 1)
        onPick(cards[rounded])
        return rounded
      })
    }, WHEEL_SETTLE_MS)
  }

  const handleCardClick = (index: number, card: string | number) => {
    if (disabled) return
    // A drag that ended over a card is not a click.
    if (dragState.current && dragState.current.moved > DRAG_CLICK_THRESHOLD_PX) return

    goTo(index)
    onPick(card)
  }

  /** Arrow keys browse the deck without a pointer (NFR-A2). */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    if (step === 0) return
    event.preventDefault()
    const next = clamp(focusedIndex + step, 0, cards.length - 1)
    goTo(next)
    onPick(cards[next])
  }

  return (
    <div
      role="listbox"
      aria-label="Your card"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      className="poker-carousel relative w-full touch-none select-none overflow-hidden rounded-[var(--apple-radius-lg)] border border-[var(--plan-border)] bg-[var(--plan-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--plan-accent)]"
      style={{ height: PANEL_HEIGHT }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onWheel={handleWheel}
    >
      {cards.map((card, index) => {
        const offset = index - centerIndex
        const isFocused = index === focusedIndex
        const isSelected = card === selected
        const scale = scaleForOffset(offset)
        const opacity = opacityForOffset(offset)
        const rotation = rotationForOffset(offset)
        const lift = isFocused ? -FOCUS_LIFT_PX : 0

        return (
          <div
            key={String(card)}
            role="option"
            aria-label={cardAltText(card)}
            aria-selected={isSelected}
            aria-current={isFocused}
            onClick={() => handleCardClick(index, card)}
            className={cn('absolute left-1/2 cursor-pointer', !dragging && 'poker-card-snap')}
            style={{
              // Anchored near the top of the panel rather than its centre: the
              // arc sweeps downward from the focused card, so centring would
              // push the outer cards off the bottom edge.
              top: 30,
              marginLeft: -FOCUSED_CARD_WIDTH / 2,
              transformOrigin: `50% ${CARD_PIVOT_RADIUS}px`,
              transform: `rotate(${rotation}deg) translateY(${lift}px) scale(${scale})`,
              opacity,
              zIndex: 100 - Math.round(Math.abs(offset) * 10),
              pointerEvents: opacity <= 0 ? 'none' : 'auto'
            }}
          >
            <PokerCard
              card={card}
              width={FOCUSED_CARD_WIDTH}
              tone={isSelected || isFocused ? 'selected' : scale < 0.8 ? 'muted' : 'default'}
            />
          </div>
        )
      })}

      {/* Marks the card a confirm would cast, directly under the arc's apex. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-1.5">
        <span className="h-[3px] w-7 rounded-full bg-[var(--plan-accent)]" />
        <span className="apple-type-caption font-semibold uppercase tracking-[0.06em] text-[var(--plan-accent)]">
          {selected != null && cards[focusedIndex] === selected ? 'Selected' : 'Pick'}
        </span>
      </div>
    </div>
  )
}
