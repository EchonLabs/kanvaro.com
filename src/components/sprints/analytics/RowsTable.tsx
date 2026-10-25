import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'
import { standupStrings } from '@/lib/standup/strings'

const s = standupStrings.analytics

export interface RowsColumn {
  key: string
  label: string
  align?: 'left' | 'right'
}

/**
 * The underlying rows behind a widget's figure (UI-13), as a plain table.
 *
 * Its own horizontal scroll box, so a wide table on a phone scrolls inside
 * the card instead of pushing the whole page sideways.
 */
export function RowsTable({
  columns,
  rows,
  caption
}: {
  columns: RowsColumn[]
  rows: { key: string; cells: Record<string, React.ReactNode> }[]
  caption: string
}) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full border-collapse apple-type-footnote" data-testid="analytics-rows-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'apple-section-label whitespace-nowrap px-2 pb-2 font-semibold text-[var(--plan-muted)]',
                  column.align === 'right' ? 'text-right' : 'text-left'
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-[var(--plan-border)]">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    'px-2 py-2 align-top text-[var(--plan-text)]',
                    column.align === 'right' ? 'whitespace-nowrap text-right' : 'text-left'
                  )}
                >
                  {row.cells[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * "Show rows": the disclosure every chart widget carries, so no figure on the
 * screen is reachable only by reading a bar's height or hovering it.
 */
export function ShowRows({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const regionId = useId()

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((value) => !value)}
        className="apple-transition inline-flex items-center gap-1 self-start rounded-[var(--apple-radius-sm)] apple-type-footnote font-semibold text-[var(--plan-accent-ink)] hover:underline"
      >
        {open ? s.hideRows() : s.showRows()}
        <ChevronDown
          className={cn('h-3.5 w-3.5 apple-transition', open && 'rotate-180')}
          strokeWidth={2.25}
          aria-hidden="true"
        />
      </button>
      <div id={regionId} hidden={!open}>
        {open && children}
      </div>
    </div>
  )
}

/** The one-line "what this view withholds" note on aggregate widgets. */
export function TeamViewNote() {
  return <p className="apple-type-footnote text-[var(--plan-muted)]">{s.teamViewNote()}</p>
}
