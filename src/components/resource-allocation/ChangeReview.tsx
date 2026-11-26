import { ArrowRight } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface ReviewLine {
  projectName: string
  previousPercent: number
  newPercent: number
}

interface Props {
  lines: ReviewLine[]
  totalAfter: number
  threshold: number
}

const box = 'rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] p-3'
const boxTitle = 'mb-2 text-[11px] font-semibold text-[var(--apple-secondary-label)]'

function Delta({ value }: { value: number }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
        value > 0
          ? 'bg-[color-mix(in_srgb,var(--apple-system-green)_14%,transparent)] text-[var(--apple-system-green)]'
          : 'bg-[color-mix(in_srgb,var(--apple-system-red)_14%,transparent)] text-[var(--apple-system-red)]'
      )}
    >
      {value > 0 ? `+${value}` : value}%
    </span>
  )
}

/**
 * Before → after for one member's allocation change. Shared by the Manage
 * modal's review step, the wizard's review step and the approval modal, so all
 * three show a change exactly the same way.
 */
export function ChangeReview({ lines, totalAfter, threshold }: Props) {
  const availableAfter = threshold - totalAfter

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <div className={box}>
          <p className={boxTitle}>Current allocation</p>
          {lines.map((line) => (
            <p key={line.projectName} className="flex justify-between text-[13px] font-medium text-[var(--apple-label)]">
              <span className="truncate pr-2">{line.projectName}</span>
              <span className="tabular-nums">{line.previousPercent}%</span>
            </p>
          ))}
        </div>
        <ArrowRight aria-hidden className="mx-auto hidden h-4 w-4 text-[var(--apple-tertiary-label)] sm:block" />
        <div className={box}>
          <p className={boxTitle}>New allocation</p>
          {lines.map((line) => (
            <p key={line.projectName} className="flex justify-between text-[13px] font-medium text-[var(--apple-label)]">
              <span className="truncate pr-2">{line.projectName}</span>
              <span className="tabular-nums text-[var(--apple-system-blue)]">{line.newPercent}%</span>
            </p>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-[var(--apple-radius-md)] bg-[var(--apple-quaternary-fill)] px-4 py-3">
        <span className="text-[14px] font-medium text-[var(--apple-label)]">Total allocation</span>
        <span
          className={cn(
            'text-[17px] font-semibold tabular-nums',
            availableAfter < 0 ? 'text-[var(--apple-system-red)]' : 'text-[var(--apple-label)]'
          )}
        >
          {totalAfter}%
        </span>
      </div>

      <ul className={cn(box, 'divide-y divide-[var(--apple-separator)] py-0')}>
        {lines.map((line) => (
          <li key={line.projectName} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
            <span className="truncate text-[var(--apple-label)]">{line.projectName}</span>
            <span className="text-[11px] tabular-nums text-[var(--apple-secondary-label)]">
              {line.previousPercent}% → {line.newPercent}%
            </span>
            <Delta value={line.newPercent - line.previousPercent} />
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
          <span className="text-[var(--apple-label)]">Available capacity</span>
          <span className="text-[11px] text-[var(--apple-secondary-label)]">After change</span>
          <span
            className={cn(
              'font-semibold tabular-nums',
              availableAfter < 0 ? 'text-[var(--apple-system-red)]' : 'text-[var(--apple-label)]'
            )}
          >
            {availableAfter}%
          </span>
        </li>
      </ul>
    </div>
  )
}
