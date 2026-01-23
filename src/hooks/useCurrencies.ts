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

// Comprehensive list of all world currencies
const allWorldCurrencies: Currency[] = [
  // Major World Currencies
  { _id: 'usd', code: 'USD', name: 'US Dollar', symbol: '$', country: 'United States', isActive: true, isMajor: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'eur', code: 'EUR', name: 'Euro', symbol: '€', country: 'European Union', isActive: true, isMajor: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'jpy', code: 'JPY', name: 'Japanese Yen', symbol: '¥', country: 'Japan', isActive: true, isMajor: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'gbp', code: 'GBP', name: 'British Pound Sterling', symbol: '£', country: 'United Kingdom', isActive: true, isMajor: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'aud', code: 'AUD', name: 'Australian Dollar', symbol: 'A$', country: 'Australia', isActive: true, isMajor: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'cad', code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', country: 'Canada', isActive: true, isMajor: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'chf', code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', country: 'Switzerland', isActive: true, isMajor: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'cny', code: 'CNY', name: 'Chinese Yuan', symbol: '¥', country: 'China', isActive: true, isMajor: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'sek', code: 'SEK', name: 'Swedish Krona', symbol: 'kr', country: 'Sweden', isActive: true, isMajor: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'nzd', code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', country: 'New Zealand', isActive: true, isMajor: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },

  // European Currencies
  { _id: 'dkk', code: 'DKK', name: 'Danish Krone', symbol: 'kr', country: 'Denmark', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'nok', code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', country: 'Norway', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'pln', code: 'PLN', name: 'Polish Złoty', symbol: 'zł', country: 'Poland', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'czk', code: 'CZK', name: 'Czech Koruna', symbol: 'Kč', country: 'Czech Republic', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'huf', code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft', country: 'Hungary', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'ron', code: 'RON', name: 'Romanian Leu', symbol: 'lei', country: 'Romania', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'bgn', code: 'BGN', name: 'Bulgarian Lev', symbol: 'лв', country: 'Bulgaria', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'hrk', code: 'HRK', name: 'Croatian Kuna', symbol: 'kn', country: 'Croatia', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'isk', code: 'ISK', name: 'Icelandic Króna', symbol: 'kr', country: 'Iceland', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },

  // Asian Currencies
  { _id: 'inr', code: 'INR', name: 'Indian Rupee', symbol: '₹', country: 'India', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'krw', code: 'KRW', name: 'South Korean Won', symbol: '₩', country: 'South Korea', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'sgd', code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', country: 'Singapore', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'hkd', code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', country: 'Hong Kong', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'twd', code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$', country: 'Taiwan', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'thb', code: 'THB', name: 'Thai Baht', symbol: '฿', country: 'Thailand', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'myr', code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', country: 'Malaysia', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'idr', code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', country: 'Indonesia', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'php', code: 'PHP', name: 'Philippine Peso', symbol: '₱', country: 'Philippines', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'vnd', code: 'VND', name: 'Vietnamese Đồng', symbol: '₫', country: 'Vietnam', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'bdt', code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', country: 'Bangladesh', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'pkr', code: 'PKR', name: 'Pakistani Rupee', symbol: '₨', country: 'Pakistan', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'lkr', code: 'LKR', name: 'Sri Lankan Rupee', symbol: '₨', country: 'Sri Lanka', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },

  // Middle East & African Currencies
  { _id: 'ils', code: 'ILS', name: 'Israeli New Shekel', symbol: '₪', country: 'Israel', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'sar', code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', country: 'Saudi Arabia', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'aed', code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', country: 'United Arab Emirates', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'qar', code: 'QAR', name: 'Qatari Riyal', symbol: '﷼', country: 'Qatar', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'bhd', code: 'BHD', name: 'Bahraini Dinar', symbol: 'د.ب', country: 'Bahrain', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'kwd', code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'د.ك', country: 'Kuwait', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'omr', code: 'OMR', name: 'Omani Rial', symbol: '﷼', country: 'Oman', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'jod', code: 'JOD', name: 'Jordanian Dinar', symbol: 'د.أ', country: 'Jordan', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'egp', code: 'EGP', name: 'Egyptian Pound', symbol: '£', country: 'Egypt', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'zar', code: 'ZAR', name: 'South African Rand', symbol: 'R', country: 'South Africa', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'kes', code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', country: 'Kenya', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'ngn', code: 'NGN', name: 'Nigerian Naira', symbol: '₦', country: 'Nigeria', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'ghs', code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵', country: 'Ghana', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'tzs', code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh', country: 'Tanzania', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },

  // American Currencies
  { _id: 'brl', code: 'BRL', name: 'Brazilian Real', symbol: 'R$', country: 'Brazil', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'ars', code: 'ARS', name: 'Argentine Peso', symbol: '$', country: 'Argentina', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'clp', code: 'CLP', name: 'Chilean Peso', symbol: '$', country: 'Chile', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'cop', code: 'COP', name: 'Colombian Peso', symbol: '$', country: 'Colombia', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'pen', code: 'PEN', name: 'Peruvian Sol', symbol: 'S/', country: 'Peru', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'uyu', code: 'UYU', name: 'Uruguayan Peso', symbol: '$', country: 'Uruguay', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'mxn', code: 'MXN', name: 'Mexican Peso', symbol: '$', country: 'Mexico', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },

  // Other Global Currencies
  { _id: 'rub', code: 'RUB', name: 'Russian Ruble', symbol: '₽', country: 'Russia', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'try', code: 'TRY', name: 'Turkish Lira', symbol: '₺', country: 'Turkey', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'btc', code: 'BTC', name: 'Bitcoin', symbol: '₿', country: 'Cryptocurrency', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { _id: 'eth', code: 'ETH', name: 'Ethereum', symbol: 'Ξ', country: 'Cryptocurrency', isActive: true, isMajor: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
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
        
        // Use comprehensive world currencies list
        // In the future, this could be enhanced to fetch from database
        setCurrencies(allWorldCurrencies)
      } catch (err) {
        console.error('Error fetching currencies:', err)
        // Use comprehensive list as fallback
        setCurrencies(allWorldCurrencies)
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
