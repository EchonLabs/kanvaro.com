'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbContextType {
  items: BreadcrumbItem[]
  setItems: (items: BreadcrumbItem[]) => void
}

const BreadcrumbContext = createContext<BreadcrumbContextType | undefined>(undefined)

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BreadcrumbItem[]>([])

  // Memoize setItems to prevent unnecessary re-renders
  const setItemsMemo = useCallback((newItems: BreadcrumbItem[]) => {
    setItems(newItems)
  }, [])

  return (
    <BreadcrumbContext.Provider value={{ items, setItems: setItemsMemo }}>
      {children}
    </BreadcrumbContext.Provider>
  )
}

export function useBreadcrumb() {
  const context = useContext(BreadcrumbContext)
  if (!context) {
    // Return a safe default instead of throwing
    // This allows the hook to be used even if provider is not available
    return {
      items: [],
      setItems: () => {} // No-op function
    }
  }
  return context
}

