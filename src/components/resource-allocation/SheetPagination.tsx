'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  page: number
  limit: number
  total: number
  shown: number
  noun: string
  onPage(page: number): void
  onLimit(limit: number): void
}

const SIZES = [10, 25, 50]

export function SheetPagination({ page, limit, total, shown, noun, onPage, onLimit }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const button =
    'rounded-[var(--apple-radius-pill)] border border-[var(--apple-separator)] px-3 py-1.5 text-[12px] font-medium text-[var(--apple-label)] hover:bg-[var(--apple-quaternary-fill)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-system-blue)]'

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--apple-separator)] px-4 py-3 text-[12px] text-[var(--apple-secondary-label)] sm:flex-row sm:items-center sm:justify-between">
      <p>
        Showing {shown} of {total} {noun}
      </p>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-2">
          per page:
          <Select value={String(limit)} onValueChange={(value) => onLimit(Number(value))}>
            <SelectTrigger aria-label="Rows per page" className="h-8 w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
        <button type="button" className={button} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <span className="tabular-nums">
          {page} / {totalPages}
        </span>
        <button type="button" className={button} disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  )
}
