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
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

const CARD_ASPECT = 1450 / 900
const CARD_WIDTH = 108
const CARD_PIVOT_RADIUS = 640
const ROTATION_DEG_PER_OFFSET = 8
const ROTATION_MAX_DEG = 24
const FOCUS_LIFT_PX = 14
const DRAG_PX_PER_CARD = 90
const WHEEL_UNITS_PER_CARD = 140
const DRAG_CLICK_THRESHOLD_PX = 6
const WHEEL_SETTLE_MS = 140

interface Props {
  cards: Array<string | number>
  selected: string | number | null
  disabled?: boolean
  onPick: (card: string | number) => void
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** Scale falls off with distance from center; beyond this it's fully cropped. */
function scaleForOffset(offset: number): number {
  const magnitude = Math.abs(offset)
  if (magnitude >= 3) return 0
  if (magnitude >= 2) return 0.62
  if (magnitude >= 1) return 0.78
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

/**
 * The '?' card's file is named `questionMark.png` — the symbol itself isn't a
 * legal filename — every other card (including 'coffee') is named after its
 * own card value.
 */
function cardImageFile(card: string | number): string {
  return card === '?' ? 'questionMark' : String(card)
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

  const containerHeight = CARD_WIDTH * CARD_ASPECT + 40

  return (
    <div className="space-y-2">
      <div
        role="listbox"
        aria-label="Your card"
        className="poker-carousel relative touch-none select-none overflow-hidden"
        style={{ height: containerHeight }}
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
              aria-selected={isSelected}
              aria-current={isFocused}
              onClick={() => handleCardClick(index, card)}
              className={cn(
                'absolute left-1/2 top-1/2 cursor-pointer',
                !dragging && 'poker-card-snap'
              )}
              style={{
                width: CARD_WIDTH,
                height: CARD_WIDTH * CARD_ASPECT,
                marginLeft: -CARD_WIDTH / 2,
                marginTop: (-CARD_WIDTH * CARD_ASPECT) / 2,
                transformOrigin: `50% ${CARD_PIVOT_RADIUS}px`,
                transform: `rotate(${rotation}deg) translateY(${lift}px) scale(${scale})`,
                opacity,
                zIndex: 100 - Math.round(Math.abs(offset) * 10),
                pointerEvents: opacity <= 0 ? 'none' : 'auto'
              }}
            >
              <div
                className={cn(
                  'apple-transition h-full w-full overflow-hidden rounded-[14px] bg-card',
                  isFocused && 'ring-2 ring-[var(--apple-system-blue)] ring-offset-2 ring-offset-[var(--apple-secondary-system-background)]',
                  isSelected && 'ring-2 ring-[var(--apple-system-blue)]'
                )}
              >
                <Image
                  src={`/poker-cards/${cardImageFile(card)}.png`}
                  alt={cardAltText(card)}
                  width={900}
                  height={1450}
                  draggable={false}
                  className="h-full w-full object-cover"
                  priority
                />
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-center text-[12px] text-[var(--apple-tertiary-label)]">
        Scroll or drag to browse, then Confirm your card below
      </p>
    </div>
  )
}
