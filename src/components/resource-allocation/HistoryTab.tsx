'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'

import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { cn } from '@/lib/utils'

import { fetchHistory, type HistoryEntry } from './api'
import { SheetPagination } from './SheetPagination'

const STATUS: Record<HistoryEntry['status'], { label: string; className: string }> = {
  updated: {
    label: 'Updated',
    className: 'text-[var(--apple-system-blue)] bg-[color-mix(in_srgb,var(--apple-system-blue)_12%,transparent)]'
  },
  approved: {
    label: 'Approved',
    className: 'text-[var(--apple-system-green)] bg-[color-mix(in_srgb,var(--apple-system-green)_12%,transparent)]'
  },
  rejected: {
    label: 'Rejected',
    className: 'text-[var(--apple-system-red)] bg-[color-mix(in_srgb,var(--apple-system-red)_12%,transparent)]'
  }
}

const cell = 'px-3 py-3 align-top'

function splitName(name: string) {
  const [firstName, ...rest] = name.split(' ')
  return { firstName, lastName: rest.join(' ') }
}
const head = 'apple-section-label px-3 py-2 text-left whitespace-nowrap'

/** Every applied change and every rejected request, newest first. */
export function HistoryTab() {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [data, setData] = useState<{ items: HistoryEntry[]; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(
      () => {
        fetchHistory({ q: query.trim() || undefined, page, limit })
          .then((result) => !cancelled && setData(result))
          .catch((err: Error) => !cancelled && setError(err.message))
      },
      query ? 250 : 0
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, page, limit])

  return (
    <section className="overflow-hidden rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card">
      <div className="flex flex-col gap-3 border-b border-[var(--apple-separator)] p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[14px] text-[var(--apple-secondary-label)]">A complete audit trail of resource allocation changes</p>
        <label className="relative sm:w-72">
          <span className="sr-only">Search history</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--apple-tertiary-label)]" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            placeholder="Search history..."
            className="h-9 w-full rounded-[var(--apple-radius-pill)] border border-[var(--apple-separator)] bg-transparent pl-9 pr-3 text-[13px] text-[var(--apple-label)] placeholder:text-[var(--apple-tertiary-label)] focus:outline-none focus:ring-2 focus:ring-[var(--apple-system-blue)]"
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="px-4 py-8 text-center text-[14px] text-[var(--apple-system-red)]">
          Couldn’t load history: {error}
        </p>
      )}

      {data && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-[13px]">
            <thead>
              <tr className="border-b border-[var(--apple-separator)]">
                <th scope="col" className={head}>Date</th>
                <th scope="col" className={head}>Employee</th>
                <th scope="col" className={head}>Changed by</th>
                <th scope="col" className={head}>Project</th>
                <th scope="col" className={head}>Previous</th>
                <th scope="col" className={head}>New</th>
                <th scope="col" className={head}>Reason</th>
                <th scope="col" className={head}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-[var(--apple-secondary-label)]">
                    No allocation changes yet.
                  </td>
                </tr>
              )}
              {data.items.map((entry) => {
                const date = new Date(entry.date)
                return (
                  <tr key={entry.id} className="border-b border-[var(--apple-separator)] last:border-b-0">
                    <td className={cn(cell, 'whitespace-nowrap')}>
                      <span className="block text-[var(--apple-label)]">{date.toLocaleDateString()}</span>
                      <span className="block text-[11px] text-[var(--apple-secondary-label)]">
                        {date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className={cell}>
                      <span className="flex items-center gap-2">
                        <GravatarAvatar user={{ ...splitName(entry.member.name), avatar: entry.member.avatar }} size={28} fallbackClassName="bg-[var(--apple-tertiary-fill)] text-[var(--apple-label)]" />
                        <span className="font-medium text-[var(--apple-label)]">{entry.member.name}</span>
                      </span>
                    </td>
                    <td className={cell}>
                      <span className="flex items-start gap-2">
                        <GravatarAvatar user={{ ...splitName(entry.changedBy.name), avatar: entry.changedBy.avatar }} size={28} fallbackClassName="bg-[var(--apple-tertiary-fill)] text-[var(--apple-label)]" />
                        <span>
                          <span className="block text-[var(--apple-label)]">{entry.changedBy.name}</span>
                          <span className="block text-[11px] text-[var(--apple-secondary-label)]">{entry.changedBy.roleLabel}</span>
                          {entry.approvedBy && (
                            <span className="block text-[11px] text-[var(--apple-secondary-label)]">
                              Approved by {entry.approvedBy.name}
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className={cn(cell, 'text-[var(--apple-label)]')}>{entry.project.name}</td>
                    <td className={cn(cell, 'tabular-nums text-[var(--apple-secondary-label)]')}>{entry.previousPercent}%</td>
                    <td className={cn(cell, 'tabular-nums font-semibold text-[var(--apple-label)]')}>{entry.newPercent}%</td>
                    <td className={cn(cell, 'max-w-[240px] text-[var(--apple-secondary-label)]')}>
                      {entry.reason}
                      {entry.note && (
                        <span className="mt-1 block text-[11px] text-[var(--apple-system-red)]">Note: {entry.note}</span>
                      )}
                    </td>
                    <td className={cell}>
                      <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium', STATUS[entry.status].className)}>
                        {STATUS[entry.status].label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > 0 && (
        <SheetPagination
          page={page}
          limit={limit}
          total={data.total}
          shown={data.items.length}
          noun="records"
          onPage={setPage}
          onLimit={(next) => {
            setLimit(next)
            setPage(1)
          }}
        />
      )}
    </section>
  )
}
