import { useState, useEffect } from 'react'

export interface Currency {
  _id: string
  code: string
  name: string
  symbol: string
  country: string
  isActive: boolean
  isMajor: boolean
  createdAt: string
  updatedAt: string
}

// Fallback currencies for when database is empty
const fallbackCurrencies: Currency[] = [
  { _id: 'usd', code: 'USD', name: 'US Dollar', symbol: '$', country: 'United States', isActive: true, isMajor: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'eur', code: 'EUR', name: 'Euro', symbol: '€', country: 'European Union', isActive: true, isMajor: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'gbp', code: 'GBP', name: 'British Pound Sterling', symbol: '£', country: 'United Kingdom', isActive: true, isMajor: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'jpy', code: 'JPY', name: 'Japanese Yen', symbol: '¥', country: 'Japan', isActive: true, isMajor: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'chf', code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', country: 'Switzerland', isActive: true, isMajor: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'cad', code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', country: 'Canada', isActive: true, isMajor: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'aud', code: 'AUD', name: 'Australian Dollar', symbol: 'A$', country: 'Australia', isActive: true, isMajor: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'nzd', code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', country: 'New Zealand', isActive: true, isMajor: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'cny', code: 'CNY', name: 'Chinese Yuan', symbol: '¥', country: 'China', isActive: true, isMajor: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'inr', code: 'INR', name: 'Indian Rupee', symbol: '₹', country: 'India', isActive: true, isMajor: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'mxn', code: 'MXN', name: 'Mexican Peso', symbol: '$', country: 'Mexico', isActive: true, isMajor: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
]

export function useCurrencies(majorOnly: boolean = false) {
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchCurrencies = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const params = new URLSearchParams()
        if (majorOnly) {
          params.append('major', 'true')
        }
        
        const response = await fetch(`/api/currencies?${params.toString()}`)
        const data = await response.json()
        
        if (data.success) {
          // Use database currencies if available, otherwise use fallback
          const dbCurrencies = data.data || []
          if (dbCurrencies.length > 0) {
            setCurrencies(dbCurrencies)
          } else {
            // Use fallback currencies when database is empty
            setCurrencies(fallbackCurrencies)
          }
        } else {
          // Use fallback currencies on error
          setCurrencies(fallbackCurrencies)
        }
      } catch (err) {
        console.error('Error fetching currencies:', err)
        // Use fallback currencies on error
        setCurrencies(fallbackCurrencies)
      } finally {
        setLoading(false)
      }
    }

    fetchCurrencies()
  }, [majorOnly])

  const formatCurrencyDisplay = (currency: Currency): string => {
    return `${currency.code} - ${currency.name} (${currency.symbol})`
  }

  const getCurrencyByCode = (code: string): Currency | undefined => {
    return currencies.find(currency => currency.code === code)
  }

  return {
    currencies,
    loading,
    error,
    formatCurrencyDisplay,
    getCurrencyByCode
  }
}
