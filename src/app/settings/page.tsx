'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { OrganizationSettings } from '@/components/settings/OrganizationSettings'
import { EmailSettings } from '@/components/settings/EmailSettings'
import { DatabaseSettings } from '@/components/settings/DatabaseSettings'
import { DocumentationSettings } from '@/components/settings/DocumentationSettings'
import { HolidaySetManager } from '@/components/standup/HolidaySetManager'
import { useAuthContext } from '@/contexts/AuthContext'
import {
  Building2,
  CalendarDays,
  Mail,
  Database,
  Settings as SettingsIcon,
  BookOpen,
  Loader2,
  ShieldOff,
} from 'lucide-react'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'organization', label: 'Organization', icon: Building2 },
  { id: 'email',        label: 'Email',         icon: Mail      },
  { id: 'database',    label: 'Database',       icon: Database  },
]

const DOC_TAB = { id: 'documentation', label: 'Documentation', icon: BookOpen }

/**
 * Organisation holiday calendars (plan DO-1/DO-2).
 *
 * Gated on HOLIDAY_MANAGE rather than SETTINGS_UPDATE, so it appears for admins
 * and HR — HR being the point, since they receive the published gazette — and
 * stays hidden from everyone else.
 */
const HOLIDAY_TAB = { id: 'holidays', label: 'Holidays', icon: CalendarDays }

export default function SettingsPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext()
  const [activeTab, setActiveTab] = useState('organization')
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const { hasPermission, loading: permissionsLoading } = usePermissions()

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      setIsLoading(false)
    } else if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  // Deep link support: /settings?tab=holidays is where the HOLIDAY_COVERAGE_GAP
  // degradation points, so the notice lands on the screen that fixes it rather
  // than on a page the reader then has to navigate from.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab')
    if (requested) setActiveTab(requested)
  }, [])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--apple-chart-to)] mx-auto mb-4" strokeWidth={1.5} />
          <p className="text-[13px] text-[var(--apple-secondary-label)]">Loading settings…</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-[13px] text-[var(--apple-secondary-label)]">No user data available</p>
      </div>
    )
  }

  const canViewSettings = hasPermission(Permission.SETTINGS_VIEW)
  const canManageDocumentation = hasPermission(Permission.DOCUMENTATION_MANAGE_PERMISSIONS)
  const canManageHolidays = hasPermission(Permission.HOLIDAY_MANAGE)

  if (!permissionsLoading && !canViewSettings) {
    return (
      <MainLayout>
        <div className="min-h-[50vh] flex items-center justify-center px-4">
          <div className="text-center max-w-sm space-y-4">
            <ShieldOff className="h-10 w-10 text-[var(--apple-system-red)] mx-auto" strokeWidth={1.5} />
            <div>
              <p className="text-[17px] font-semibold text-[var(--apple-label)]">Access Restricted</p>
              <p className="text-[13px] text-[var(--apple-secondary-label)] mt-1">
                You don't have permission to view application settings. Contact your administrator if this is a mistake.
              </p>
            </div>
          </div>
        </div>
      </MainLayout>
    )
  }

  const visibleTabs = [
    ...TABS,
    ...(canManageHolidays ? [HOLIDAY_TAB] : []),
    ...(canManageDocumentation ? [DOC_TAB] : [])
  ]

  return (
    <MainLayout>
      <div className="space-y-6 px-4 sm:px-6">

        {/* ── Page Header ── */}
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-8 w-8 flex-shrink-0 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
          <div>
            <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight text-[var(--apple-label)]">
              Settings
            </h1>
            <p className="text-[15px] text-[var(--apple-secondary-label)] mt-0.5">
              Manage your organization, holidays, email, database, and documentation
            </p>
          </div>
        </div>

        {/* ── Pill Segmented Tabs ── */}
        <div className="flex w-full items-center gap-0.5 p-0.5 rounded-full bg-[var(--apple-tertiary-fill)]">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 h-9 px-2 sm:px-3 rounded-full text-[13px] font-medium apple-transition select-none min-w-0',
                    isActive
                      ? 'bg-card text-[var(--apple-chart-color)] shadow-sm'
                      : 'text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]'
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                  <span className="hidden sm:inline truncate">{tab.label}</span>
                </button>
              )
            })}
        </div>

        {/* ── Tab Content ── */}
        <div key={activeTab} className="view-transition-container">
          {activeTab === 'organization' && <OrganizationSettings />}
          {activeTab === 'email'        && <EmailSettings />}
          {activeTab === 'database'     && <DatabaseSettings />}
          {activeTab === 'holidays'      && canManageHolidays && <HolidaySetManager />}
          {activeTab === 'documentation' && canManageDocumentation && <DocumentationSettings />}
        </div>

      </div>
    </MainLayout>
  )
}
