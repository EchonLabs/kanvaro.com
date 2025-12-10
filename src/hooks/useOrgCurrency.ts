'use client'

import { useCallback, useMemo } from 'react'
import { useOrganization } from '@/hooks/useOrganization'

/**
 * Shared currency helper that defaults to the organization's currency.
 * Provides a formatter plus the derived currency code and symbol.
 */
export function useOrgCurrency() {
  const { organization } = useOrganization()
  const currencyCode = organization?.currency || 'USD'

  const currencySymbol = useMemo(() => {
    try {
      const parts = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).formatToParts(0)
      return parts.find((part) => part.type === 'currency')?.value || currencyCode
    } catch {
      return currencyCode
    }
  }, [currencyCode])

  const formatCurrency = useCallback(
    (
      amount: number,
      currencyOverride?: string,
      options?: Intl.NumberFormatOptions
    ) => {
      const code = currencyOverride || currencyCode
      const safeAmount = Number.isFinite(amount) ? amount : 0

      try {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: code,
          ...options
        }).format(safeAmount)
      } catch {
        const fractionDigits =
          options?.maximumFractionDigits ?? options?.minimumFractionDigits ?? 2
        return `${code} ${safeAmount.toFixed(fractionDigits)}`
      }
    },
    [currencyCode]
  )

  return {
    currencyCode,
    currencySymbol,
    formatCurrency
  }
}

