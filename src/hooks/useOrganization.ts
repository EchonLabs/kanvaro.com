'use client'

import { useState, useEffect } from 'react'

interface Organization {
  id: string
  name: string
  domain?: string
  logo?: string
  darkLogo?: string
  logoMode?: 'light' | 'dark' | 'both' | 'auto'
  timezone?: string
  currency?: string
  language?: string
  industry?: string
  size?: 'startup' | 'small' | 'medium' | 'enterprise'
  settings?: {
    allowSelfRegistration?: boolean
    requireEmailVerification?: boolean
    defaultUserRole?: string
    timeTracking?: {
      allowTimeTracking?: boolean
      allowManualTimeSubmission?: boolean
      requireApproval?: boolean
      allowBillableTime?: boolean
      defaultHourlyRate?: number
      maxDailyHours?: number
      maxWeeklyHours?: number
      maxSessionHours?: number
      allowOvertime?: boolean
      requireDescription?: boolean
      requireCategory?: boolean
      allowFutureTime?: boolean
      allowPastTime?: boolean
      pastTimeLimitDays?: number
      roundingRules?: {
        enabled?: boolean
        increment?: number
        roundUp?: boolean
      }
      notifications?: {
        onTimerStart?: boolean
        onTimerStop?: boolean
        onOvertime?: boolean
        onApprovalNeeded?: boolean
        onTimeSubmitted?: boolean
      }
    }
  }
  emailConfig?: {
    provider: 'smtp' | 'azure' | 'sendgrid' | 'mailgun'
    smtp?: {
      host: string
      port: number
      secure: boolean
      username: string
      password: string
      fromEmail: string
      fromName: string
    }
    azure?: {
      clientId: string
      clientSecret: string
      tenantId: string
      fromEmail: string
      fromName: string
    }
  }
}

// Cache organization data to prevent repeated API calls
let organizationCache: Organization | null = null
let cacheTimestamp: number = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

export function useOrganization() {
  const [organization, setOrganization] = useState<Organization | null>(organizationCache)
  const [loading, setLoading] = useState(!organizationCache)

  const fetchOrganization = async (force = false) => {
    // Use cached data if available and not expired, unless force refresh
    if (!force && organizationCache && Date.now() - cacheTimestamp < CACHE_DURATION) {
      setOrganization(organizationCache)
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/organization')
      if (response.ok) {
        const data = await response.json()
        setOrganization(data)
        // Cache the data
        organizationCache = data
        cacheTimestamp = Date.now()
      } else {
        // Fallback to mock data if API fails
        const mockOrganization: Organization = {
          id: '1',
          name: 'Kanvaro',
          logo: undefined,
          darkLogo: undefined,
          logoMode: 'auto'
        }
        setOrganization(mockOrganization)
        organizationCache = mockOrganization
        cacheTimestamp = Date.now()
      }
    } catch (error) {
      console.error('Failed to fetch organization:', error)
      // Fallback to mock data on error
      const mockOrganization: Organization = {
        id: '1',
        name: 'Kanvaro',
        logo: undefined,
        darkLogo: undefined,
        logoMode: 'auto'
      }
      setOrganization(mockOrganization)
      organizationCache = mockOrganization
      cacheTimestamp = Date.now()
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrganization()
  }, [])

  return {
    organization,
    loading,
    refetch: () => fetchOrganization(true)
  }
}