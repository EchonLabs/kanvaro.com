'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { BarChart3, Download, Plus } from 'lucide-react'

import { MainLayout } from '@/components/layout/MainLayout'
import { Button } from '@/components/ui/Button'
import { PageContent } from '@/components/ui/PageContent'
import { useAuthContext } from '@/contexts/AuthContext'
import { AllocationFilters, type FilterState } from '@/components/resource-allocation/AllocationFilters'
import { AllocationMatrix } from '@/components/resource-allocation/AllocationMatrix'
import { KpiCards } from '@/components/resource-allocation/KpiCards'
import { ResourceAllocationTabs, type ResourceAllocationTab } from '@/components/resource-allocation/ResourceAllocationTabs'
import { RoleSummary } from '@/components/resource-allocation/RoleSummary'
import { SheetPagination } from '@/components/resource-allocation/SheetPagination'
import { useResourceAllocationAccess } from '@/components/resource-allocation/useResourceAllocationAccess'
import { exportUrl, fetchHistory, fetchSheet, type Sheet } from '@/components/resource-allocation/api'

const EMPTY_FILTERS: FilterState = { q: '', role: '', project: '', status: '' }

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function ResourceAllocationScreen() {
  const access = useResourceAllocationAccess()
  const { user } = useAuthContext()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const tab: ResourceAllocationTab = searchParams.get('tab') === 'history' && access.canViewHistory ? 'history' : 'overview'

  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [historyCount, setHistoryCount] = useState<number | undefined>()
  const [refreshKey, setRefreshKey] = useState(0)

  const q = useDebounced(filters.q)
  const params = useMemo(
    () => ({ q, role: filters.role, project: filters.project, status: filters.status || undefined, page, limit }),
    [q, filters.role, filters.project, filters.status, page, limit]
  )

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), [])

  useEffect(() => {
    if (!access.canView) return
    let cancelled = false
    setLoading(true)
    fetchSheet(params)
      .then((data) => {
        if (cancelled) return
        setSheet(data)
        setError(null)
      })
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [access.canView, params, refreshKey])

  useEffect(() => {
    if (!access.canViewHistory) return
    fetchHistory({ limit: 1 })
      .then((data) => setHistoryCount(data.total))
      .catch(() => setHistoryCount(undefined))
  }, [access.canViewHistory, refreshKey])

  const setTab = (next: ResourceAllocationTab) => {
    const search = new URLSearchParams(searchParams.toString())
    if (next === 'overview') search.delete('tab')
    else search.set('tab', next)
    const text = search.toString()
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false })
  }

  const changeFilters = (next: FilterState) => {
    setFilters(next)
    setPage(1)
  }

  if (!access.loading && !access.canView) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <BarChart3 className="h-10 w-10 text-[var(--apple-tertiary-label)]" strokeWidth={1.5} />
        <h1 className="mt-4 text-[17px] font-semibold text-[var(--apple-label)]">Resource allocation isn’t available to you</h1>
        <p className="mt-1 max-w-sm text-[14px] text-[var(--apple-secondary-label)]">
          Ask an administrator for access if you need to see team allocations.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[var(--apple-radius-md)] bg-[color-mix(in_srgb,var(--apple-system-blue)_12%,transparent)] text-[var(--apple-system-blue)]">
            <BarChart3 className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <div>
            <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[var(--apple-label)]">Resource Allocation</h1>
            <p className="mt-0.5 text-[15px] text-[var(--apple-secondary-label)]">
              Manage team capacity and project allocations in one place
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {access.canEdit && (
            <Button asChild className="gap-2">
              <Link href="/resource-allocation/allocate">
                <Plus className="h-4 w-4" />
                Allocate Resource
              </Link>
            </Button>
          )}
          {access.canViewHistory && (
            <Button asChild variant="outline" className="gap-2">
              <a href={exportUrl(params)} download>
                <Download className="h-4 w-4" />
                Export
              </a>
            </Button>
          )}
        </div>
      </header>

      <ResourceAllocationTabs active={tab} showHistory={access.canViewHistory} historyCount={historyCount} onChange={setTab} />

      {tab === 'overview' && (
        <>
          {sheet && <KpiCards kpis={sheet.kpis} />}
          <AllocationFilters
            value={filters}
            roles={sheet?.roles ?? []}
            projects={sheet?.projects ?? []}
            onChange={changeFilters}
          />
          <section
            aria-busy={loading}
            className="overflow-hidden rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card"
          >
            {error ? (
              <p role="alert" className="px-4 py-10 text-center text-[14px] text-[var(--apple-system-red)]">
                Couldn’t load allocations: {error}
              </p>
            ) : sheet ? (
              <>
                <AllocationMatrix
                  projects={sheet.projects}
                  rows={sheet.rows}
                  threshold={sheet.threshold}
                  canEdit={access.canEdit}
                  canApprove={access.canApprove}
                  currentUserId={user?.id}
                  rowOffset={(sheet.pagination.page - 1) * sheet.pagination.limit}
                  onManage={() => undefined}
                  onOpenRequest={() => undefined}
                />
                <SheetPagination
                  page={sheet.pagination.page}
                  limit={sheet.pagination.limit}
                  total={sheet.pagination.total}
                  shown={sheet.rows.length}
                  noun="resources"
                  onPage={setPage}
                  onLimit={(next) => {
                    setLimit(next)
                    setPage(1)
                  }}
                />
              </>
            ) : (
              <p className="px-4 py-10 text-center text-[14px] text-[var(--apple-secondary-label)]">Loading allocations…</p>
            )}
          </section>
          {sheet && <RoleSummary roles={sheet.byRole} />}
        </>
      )}

      {tab === 'history' && (
        <section className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-6 text-[14px] text-[var(--apple-secondary-label)]">
          Allocation history is coming in the next step.
        </section>
      )}
    </div>
  )
}

export default function ResourceAllocationPage() {
  return (
    <MainLayout>
      <PageContent>
        <Suspense fallback={null}>
          <ResourceAllocationScreen />
        </Suspense>
      </PageContent>
    </MainLayout>
  )
}
