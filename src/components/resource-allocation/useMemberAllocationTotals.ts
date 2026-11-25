'use client'

import { useCallback, useEffect, useState } from 'react'

import { DEFAULT_THRESHOLD } from '@/lib/resource-allocation/workload'

import { fetchSheet } from './api'

/**
 * Every resource's total allocation, keyed by user id — for showing a bar on
 * member cards elsewhere in the app. Pages through the sheet so organisations
 * larger than one page are covered.
 */
export function useMemberAllocationTotals(enabled: boolean) {
  const [totals, setTotals] = useState<Map<string, number>>(new Map())
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const load = async () => {
      const next = new Map<string, number>()
      let page = 1
      let totalPages = 1
      let latestThreshold = DEFAULT_THRESHOLD
      do {
        const sheet = await fetchSheet({ page, limit: 100 })
        for (const row of sheet.rows) next.set(row.memberId, row.total)
        latestThreshold = sheet.threshold
        totalPages = sheet.pagination.totalPages
        page += 1
      } while (page <= totalPages)
      if (!cancelled) {
        setTotals(next)
        setThreshold(latestThreshold)
      }
    }

    load().catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [enabled, version])

  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  return { totals, threshold, refresh }
}
