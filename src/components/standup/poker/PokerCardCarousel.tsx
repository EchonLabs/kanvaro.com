'use client'

/**
 * The planning-poker card fan (PLN-11 popup redesign).
 *
 * Two-step select: dragging or scrolling only changes which card sits at
 * `centerIndex` (browsing — bigger, outlined, no vote). Clicking the card
 * that is *already* centered is the confirm step and calls `onSelect`.
 * Clicking any other card just animates the fan to bring it to center.
 *
 * `centerIndex` is a float so drag/wheel input can move it continuously;
 * `focusedIndex` (its rounded value) is what decides which single card is
 * "big" and which click resolves to a vote.
 */
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

const CARD_ASPECT = 1450 / 900
const CARD_WIDTH = 108
const CARD_SPACING = 74
const DRAG_PX_PER_CARD = 90
const WHEEL_UNITS_PER_CARD = 140
const DRAG_CLICK_THRESHOLD_PX = 6
const WHEEL_SETTLE_MS = 140

interface Props {
  cards: Array<string | number>
  selected: string | number | null
  disabled?: boolean
  onSelect: (card: string | number) => void
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

export function PokerCardCarousel({ cards, selected, disabled, onSelect }: Props) {
  const selectedIndex = cards.findIndex((card) => card === selected)
  const initialIndex = selectedIndex >= 0 ? selectedIndex : Math.floor((cards.length - 1) / 2)
  const [centerIndex, setCenterIndex] = useState(initialIndex)
  const [dragging, setDragging] = useState(false)
  const [justSelected, setJustSelected] = useState<string | number | null>(null)

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
    setCenterIndex((current) => Math.round(current))
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
      setCenterIndex((current) => Math.round(current))
    }, WHEEL_SETTLE_MS)
  }

  const handleCardClick = (index: number, card: string | number) => {
    if (disabled) return
    // A drag that ended over a card is not a click.
    if (dragState.current && dragState.current.moved > DRAG_CLICK_THRESHOLD_PX) return

    if (index === focusedIndex) {
      setJustSelected(card)
      onSelect(card)
    } else {
      goTo(index)
    }
  }

  const containerHeight = CARD_WIDTH * CARD_ASPECT + 24

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

          return (
            <div
              key={String(card)}
              role="option"
              aria-selected={isSelected}
              aria-current={isFocused}
              onClick={() => handleCardClick(index, card)}
              className={cn(
                'absolute left-1/2 top-1/2 cursor-pointer',
                !dragging && 'poker-card-snap',
                card === justSelected && 'poker-card-select'
              )}
              style={{
                width: CARD_WIDTH,
                height: CARD_WIDTH * CARD_ASPECT,
                marginLeft: -CARD_WIDTH / 2,
                marginTop: (-CARD_WIDTH * CARD_ASPECT) / 2,
                transform: `translateX(${offset * CARD_SPACING}px) scale(${scale})`,
                opacity,
                zIndex: 100 - Math.round(Math.abs(offset) * 10),
                pointerEvents: opacity <= 0 ? 'none' : 'auto'
              }}
              onAnimationEnd={() => {
                if (card === justSelected) setJustSelected(null)
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
                  src={`/poker-cards/card${card}.png`}
                  alt={`Card ${card}`}
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
        Scroll or drag to browse, tap the centered card to vote
      </p>
    </div>
  )
}
