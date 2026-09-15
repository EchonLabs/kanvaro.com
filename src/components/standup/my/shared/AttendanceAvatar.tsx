import { cn } from '@/lib/utils'

/**
 * Solid, saturated fills rather than the app's semantic tone tokens — these
 * circles exist to tell members apart at a glance, not to carry status
 * meaning (status is the dot + the screen-reader label below).
 */
const AVATAR_PALETTE = ['#AF52DE', '#007AFF', '#34C759', '#FF3B30', '#FF9500', '#30B0C7']

export interface AttendanceAvatarProps {
  name: string
  status: string
  colorIndex: number
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase()
}

/**
 * One member in the summary's attendance row. Absence is never colour-only
 * (NFR-A1): an unplanned absence also gets a small dot badge, and every
 * avatar carries a screen-reader-only name + status string the coloured
 * circle alone can't.
 */
export function AttendanceAvatar({ name, status, colorIndex }: AttendanceAvatarProps) {
  const isAbsent = status === 'absent_planned' || status === 'absent_unplanned'
  const color = AVATAR_PALETTE[colorIndex % AVATAR_PALETTE.length]

  return (
    <div className="relative flex flex-col items-center gap-1.5" title={`${name} — ${status.replace(/_/g, ' ')}`}>
      <span
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-full text-[14px] font-semibold text-white',
          isAbsent && 'opacity-40'
        )}
        style={{ backgroundColor: color }}
      >
        {initialsFor(name)}
        <span className="sr-only"> {name} — {status.replace(/_/g, ' ')}</span>
      </span>
      {status === 'absent_unplanned' ? (
        <span
          className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card bg-[var(--apple-system-red)]"
          aria-hidden="true"
        />
      ) : null}
    </div>
  )
}
