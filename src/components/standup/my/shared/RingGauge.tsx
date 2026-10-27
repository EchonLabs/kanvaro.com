import { cn } from '@/lib/utils'

export type RingGaugeTone = 'blue' | 'green' | 'orange' | 'red' | 'neutral'

const RING_STROKE: Record<RingGaugeTone, string> = {
  blue: 'var(--apple-system-blue)',
  green: 'var(--apple-system-green)',
  orange: 'var(--apple-system-orange)',
  red: 'var(--apple-system-red)',
  neutral: 'var(--apple-tertiary-label)'
}

export interface RingGaugeProps {
  /** 0-100. Values outside that range are clamped — a ring can never visually lie about being over- or under-full. */
  percentage: number
  tone: RingGaugeTone
  size?: number
  strokeWidth?: number
  children?: React.ReactNode
  className?: string
}

/**
 * The one hero visual on the My Stand-up screen (design refresh, per
 * feedback that the screen read as "numbers in containers"). An outlined SVG
 * ring rather than a flat bar — the same instrument Apple's own Activity and
 * Screen Time rings use, which is why it reads as native to this app's
 * language rather than as decoration borrowed from a generic dashboard kit.
 * `children` renders centred inside the ring (a number, an icon) so the
 * figure the ring visualises is never separated from the ring itself.
 */
export function RingGauge({
  percentage,
  tone,
  size = 88,
  strokeWidth = 9,
  children,
  className
}: RingGaugeProps) {
  const clamped = Math.min(100, Math.max(0, percentage))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamped / 100)
  const center = size / 2

  return (
    <div className={cn('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--apple-tertiary-fill)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={RING_STROKE[tone]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 300ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  )
}
