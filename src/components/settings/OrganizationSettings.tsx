'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useOrganization } from '@/hooks/useOrganization'
import {
  Building2, Upload, Save, X, Users, UserCheck, Crown,
  Globe, DollarSign, Languages, Briefcase, Clock, Bell,
  ChevronRight, Shield, Timer, Loader2, Palette,
} from 'lucide-react'
import { useCurrencies } from '@/hooks/useCurrencies'
import { useNotify } from '@/lib/notify'
import { useAccentTheme, type AccentTheme } from '@/hooks/useAccentTheme'

/* ── Section card wrapper ── */
function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  action,
}: {
  icon: React.ElementType
  title: string
  description?: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
      {/* Card header */}
      <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[var(--apple-separator)]">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 flex-shrink-0 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
          <div>
            <p className="text-[15px] font-semibold text-[var(--apple-label)]">{title}</p>
            {description && <p className="text-[12px] text-[var(--apple-secondary-label)] mt-0.5">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="px-5 py-5 space-y-5">
        {children}
      </div>
    </div>
  )
}

/* ── Toggle row ── */
function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  indent = false,
}: {
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
  indent?: boolean
}) {
  return (
    <div className={`flex items-center justify-between gap-4 ${indent ? 'pl-4 border-l-2 border-[var(--apple-separator)]' : ''}`}>
      <div className="space-y-0.5 flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[var(--apple-label)]">{label}</p>
        {description && <p className="text-[12px] text-[var(--apple-secondary-label)]">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="flex-shrink-0" />
    </div>
  )
}

/* ── Styled form field ── */
function Field({ label, htmlFor, error, hint, children }: {
  label: string
  htmlFor?: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[13px] font-medium text-[var(--apple-label)]">{label}</Label>
      {children}
      {hint && !error && <p className="text-[11px] text-[var(--apple-tertiary-label)]">{hint}</p>}
      {error && <p className="text-[11px] text-[var(--apple-system-red)]">{error}</p>}
    </div>
  )
}

export function OrganizationSettings() {
  const { success: notifySuccess, error: notifyError } = useNotify()
  const { organization, loading, refetch } = useOrganization()
  const { currencies, loading: currenciesLoading, formatCurrencyDisplay, getCurrencyByCode } = useCurrencies(true)
  const [saving, setSaving] = useState(false)
  const [savingRegistration, setSavingRegistration] = useState(false)
  const [savingTimeTracking, setSavingTimeTracking] = useState(false)
  const [savingNotifications, setSavingNotifications] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    domain: '',
    timezone: 'UTC',
    currency: 'USD',
    language: 'en',
    industry: '',
    size: 'small' as 'startup' | 'small' | 'medium' | 'enterprise',
    defaultUserRole: 'team_member',
    timeTracking: {
      allowTimeTracking: true,
      allowManualTimeSubmission: true,
      allowMembersToAddTimeLogs: false,
      requireApproval: false,
      allowBillableTime: true,
      defaultHourlyRate: '0',
      maxDailyHours: '12',
      maxWeeklyHours: '60',
      maxSessionHours: '8',
      allowOvertime: false,
      requireCategory: false,
      allowFutureTime: false,
      allowPastTime: true,
      pastTimeLimitDays: '1',
      pastTimeLimitCutoffTime: '23:59',
      disableTimeLogEditing: false,
      timeLogEditMode: undefined as 'days' | 'dayOfMonth' | undefined,
      timeLogEditDays: '30',
      timeLogEditDayOfMonth: '15',
      roundingRules: { enabled: false, increment: '15', roundUp: true },
      notifications: {
        onTimerStart: false,
        onTimerStop: true,
        onOvertime: true,
        onApprovalNeeded: true,
        onTimeSubmitted: true,
      },
    },
    notifications: { retentionDays: 30, autoCleanup: true },
  })
  const [roundingIncrementInput, setRoundingIncrementInput] = useState('15')
  const [notificationRetentionInput, setNotificationRetentionInput] = useState('30')
  const [logo, setLogo] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [darkLogo, setDarkLogo] = useState<File | null>(null)
  const [darkLogoPreview, setDarkLogoPreview] = useState<string | null>(null)
  const [logoMode, setLogoMode] = useState<'single' | 'dual'>('single')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [currencySearchQuery, setCurrencySearchQuery] = useState('')

  /* ── Saved-state snapshots for dirty-detection ── */
  const savedOrgInfo = useRef<{ name: string; domain: string; timezone: string; currency: string; language: string; industry: string; size: string } | null>(null)
  const savedRegistration = useRef<string | null>(null)
  const savedTimeTracking = useRef<typeof formData.timeTracking | null>(null)
  const savedNotifications = useRef<{ retentionDays: number; autoCleanup: boolean } | null>(null)

  const { theme: accentTheme, updateTheme: updateAccentTheme } = useAccentTheme()

  const currentCurrencySymbol = useMemo(() => {
    const currency = getCurrencyByCode(formData.currency)
    return currency?.symbol || '$'
  }, [formData.currency, getCurrencyByCode])

  const invalidateOrganizationCache = useCallback(async () => {
    window.dispatchEvent(new CustomEvent('organization-settings-updated', { detail: { timestamp: Date.now() } }))
    if (typeof window !== 'undefined') {
      window.history.replaceState({ ...window.history.state, cacheKey: Date.now() }, '')
    }
  }, [])

  const timezones = [
    'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai',
    'Asia/Kolkata', 'Australia/Sydney',
  ]

  const languages = [
    { code: 'en', name: 'English' }, { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' }, { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' }, { code: 'pt', name: 'Portuguese' },
    { code: 'ru', name: 'Russian' }, { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' }, { code: 'zh', name: 'Chinese' },
  ]

  const industries = [
    'Technology', 'Healthcare', 'Finance', 'Education', 'Manufacturing',
    'Retail', 'Consulting', 'Real Estate', 'Media', 'Non-profit', 'Other',
  ]

  const organizationSizes = [
    { value: 'startup',    label: 'Startup',    sub: '1–10 employees',   icon: Users      },
    { value: 'small',      label: 'Small',      sub: '11–50 employees',  icon: UserCheck  },
    { value: 'medium',     label: 'Medium',     sub: '51–200 employees', icon: Building2  },
    { value: 'enterprise', label: 'Enterprise', sub: '200+ employees',   icon: Crown      },
  ]

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'light' | 'dark') => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { alert('File size must be less than 5MB'); return }
    if (type === 'light') {
      setLogo(file)
      const reader = new FileReader()
      reader.onload = (e) => setLogoPreview(e.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setDarkLogo(file)
      const reader = new FileReader()
      reader.onload = (e) => setDarkLogoPreview(e.target?.result as string)
      reader.readAsDataURL(file)
    }
  }

  const removeLogo = (type: 'light' | 'dark') => {
    if (type === 'light') { setLogo(null); setLogoPreview(null) }
    else { setDarkLogo(null); setDarkLogoPreview(null) }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    if (!formData.name.trim()) newErrors.name = 'Organization name is required'
    if (formData.domain) {
      const domainRegex = /^(https?:\/\/)?([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(\/.*)?$/
      if (!domainRegex.test(formData.domain)) newErrors.domain = 'Please enter a valid domain name or URL'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const isFormValid = formData.name.trim() !== '' && (!formData.domain || /^(https?:\/\/)?([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(\/.*)?$/.test(formData.domain))

  /* Per-section dirty flags — save buttons are disabled until something changes */
  const hasOrgInfoChanges = !savedOrgInfo.current || logo !== null || darkLogo !== null || (
    formData.name !== savedOrgInfo.current.name ||
    formData.domain !== savedOrgInfo.current.domain ||
    formData.timezone !== savedOrgInfo.current.timezone ||
    formData.currency !== savedOrgInfo.current.currency ||
    formData.language !== savedOrgInfo.current.language ||
    formData.industry !== savedOrgInfo.current.industry ||
    formData.size !== savedOrgInfo.current.size
  )
  const hasRegistrationChanges = !savedRegistration.current || formData.defaultUserRole !== savedRegistration.current
  const hasTimeTrackingChanges = !savedTimeTracking.current || JSON.stringify(formData.timeTracking) !== JSON.stringify(savedTimeTracking.current)

  /* Cross-field validation for time tracking limits: a session sits inside a day, and a day
     sits inside a week, so the outer limit can never be set lower than the inner one — doing
     so would make the daily/session limit impossible to actually reach. */
  const timeTrackingLimitErrors = useMemo(() => {
    const daily = parseInt(formData.timeTracking.maxDailyHours as any)
    const weekly = parseInt(formData.timeTracking.maxWeeklyHours as any)
    const session = parseInt(formData.timeTracking.maxSessionHours as any)
    const errs: { maxDailyHours?: string; maxWeeklyHours?: string; maxSessionHours?: string } = {}

    if (isNaN(daily) || daily <= 0) {
      errs.maxDailyHours = 'Must be at least 1 hour.'
    }
    if (isNaN(weekly) || weekly <= 0) {
      errs.maxWeeklyHours = 'Must be at least 1 hour.'
    }
    if (isNaN(session) || session <= 0) {
      errs.maxSessionHours = 'Must be at least 1 hour.'
    }
    if (!errs.maxDailyHours && !errs.maxWeeklyHours && weekly < daily) {
      errs.maxWeeklyHours = `Can't be lower than the daily limit (${daily}h) — a week contains several days, so its cap must be able to fit at least one full day at the daily limit.`
    }
    if (!errs.maxDailyHours && !errs.maxSessionHours && session > daily) {
      errs.maxSessionHours = `Can't be higher than the daily limit (${daily}h) — a single session is part of a day's total, so it can't exceed it.`
    }
    return errs
  }, [formData.timeTracking.maxDailyHours, formData.timeTracking.maxWeeklyHours, formData.timeTracking.maxSessionHours])
  const hasTimeTrackingLimitErrors = Object.keys(timeTrackingLimitErrors).length > 0
  const hasNotificationChanges = !savedNotifications.current || (
    notificationRetentionInput !== savedNotifications.current.retentionDays.toString() ||
    (formData.notifications?.autoCleanup ?? true) !== savedNotifications.current.autoCleanup
  )

  useEffect(() => {
    if (organization) {
      const retentionDaysFromOrg = organization.settings?.notifications?.retentionDays ?? 30
      setFormData({
        name: organization.name || '',
        domain: organization.domain || '',
        timezone: organization.timezone || 'UTC',
        currency: organization.currency || 'USD',
        language: organization.language || 'en',
        industry: organization.industry || '',
        size: organization.size || 'small',
        defaultUserRole: organization.settings?.defaultUserRole || 'team_member',
        timeTracking: {
          allowTimeTracking: true,
          allowManualTimeSubmission: true,
          allowMembersToAddTimeLogs: false,
          requireApproval: false,
          allowBillableTime: true,
          defaultHourlyRate: '0',
          maxDailyHours: '12',
          maxWeeklyHours: '60',
          maxSessionHours: '8',
          allowOvertime: false,
          requireCategory: false,
          allowFutureTime: false,
          allowPastTime: true,
          pastTimeLimitDays: '1',
          pastTimeLimitCutoffTime: '23:59',
          disableTimeLogEditing: false,
          timeLogEditMode: undefined,
          timeLogEditDays: '30',
          timeLogEditDayOfMonth: '15',
          roundingRules: { enabled: false, increment: '15', roundUp: true },
          notifications: { onTimerStart: false, onTimerStop: true, onOvertime: true, onApprovalNeeded: true, onTimeSubmitted: true },
        },
        notifications: {
          retentionDays: retentionDaysFromOrg,
          autoCleanup: organization.settings?.notifications?.autoCleanup ?? true,
        },
      })
      setNotificationRetentionInput(retentionDaysFromOrg.toString())

      /* Populate saved-state snapshots */
      savedOrgInfo.current = {
        name: organization.name || '',
        domain: organization.domain || '',
        timezone: organization.timezone || 'UTC',
        currency: organization.currency || 'USD',
        language: organization.language || 'en',
        industry: organization.industry || '',
        size: organization.size || 'small',
      }
      savedRegistration.current = organization.settings?.defaultUserRole || 'team_member'
      savedNotifications.current = { retentionDays: retentionDaysFromOrg, autoCleanup: organization.settings?.notifications?.autoCleanup ?? true }

      const loadTimeTrackingSettings = async () => {
        try {
          const response = await fetch('/api/time-tracking/settings')
          if (response.ok) {
            const data = await response.json()
            if (data.settings) {
              setFormData(prev => ({
                ...prev,
                timeTracking: {
                  allowTimeTracking: data.settings.allowTimeTracking ?? prev.timeTracking.allowTimeTracking,
                  allowManualTimeSubmission: data.settings.allowManualTimeSubmission ?? prev.timeTracking.allowManualTimeSubmission,
                  allowMembersToAddTimeLogs: data.settings.allowMembersToAddTimeLogs ?? prev.timeTracking.allowMembersToAddTimeLogs,
                  requireApproval: data.settings.requireApproval ?? prev.timeTracking.requireApproval,
                  allowBillableTime: data.settings.allowBillableTime ?? prev.timeTracking.allowBillableTime,
                  defaultHourlyRate: data.settings.defaultHourlyRate ?? prev.timeTracking.defaultHourlyRate,
                  maxDailyHours: data.settings.maxDailyHours ?? prev.timeTracking.maxDailyHours,
                  maxWeeklyHours: data.settings.maxWeeklyHours ?? prev.timeTracking.maxWeeklyHours,
                  maxSessionHours: data.settings.maxSessionHours ?? prev.timeTracking.maxSessionHours,
                  allowOvertime: data.settings.allowOvertime ?? prev.timeTracking.allowOvertime,
                  requireCategory: data.settings.requireCategory ?? prev.timeTracking.requireCategory,
                  allowFutureTime: data.settings.allowFutureTime ?? prev.timeTracking.allowFutureTime,
                  allowPastTime: data.settings.allowPastTime ?? prev.timeTracking.allowPastTime,
                  pastTimeLimitDays: data.settings.pastTimeLimitDays ?? prev.timeTracking.pastTimeLimitDays,
                  pastTimeLimitCutoffTime: data.settings.pastTimeLimitCutoffTime ?? prev.timeTracking.pastTimeLimitCutoffTime,
                  disableTimeLogEditing: data.settings.disableTimeLogEditing ?? prev.timeTracking.disableTimeLogEditing ?? false,
                  timeLogEditMode: data.settings.timeLogEditMode as 'days' | 'dayOfMonth' | undefined ?? prev.timeTracking.timeLogEditMode,
                  timeLogEditDays: data.settings.timeLogEditDays ?? prev.timeTracking.timeLogEditDays,
                  timeLogEditDayOfMonth: data.settings.timeLogEditDayOfMonth ?? prev.timeTracking.timeLogEditDayOfMonth,
                  roundingRules: data.settings.roundingRules ?? prev.timeTracking.roundingRules,
                  notifications: data.settings.notifications ?? prev.timeTracking.notifications,
                },
              }))
              if (data.settings.roundingRules?.increment) {
                setRoundingIncrementInput(data.settings.roundingRules.increment.toString())
              }
              savedTimeTracking.current = data.settings
            }
          }
        } catch (error) {
          console.error('Failed to load time tracking settings:', error)
        }
      }
      loadTimeTrackingSettings()

      const orgIncrement = organization.settings?.timeTracking?.roundingRules?.increment
      setRoundingIncrementInput(
        typeof orgIncrement === 'number' && !Number.isNaN(orgIncrement) ? orgIncrement.toString() : '15'
      )
      if (organization.logo) setLogoPreview(organization.logo)
      if (organization.darkLogo) setDarkLogoPreview(organization.darkLogo)
      if (organization.logoMode) {
        setLogoMode(organization.logoMode === 'light' || organization.logoMode === 'dark' ? 'single' : 'dual')
      }
    }
  }, [organization])

  const handleSave = async () => {
    if (!validateForm()) return
    setSaving(true)
    try {
      const formDataToSend = new FormData()
      formDataToSend.append('data', JSON.stringify({ ...formData, logoMode }))
      if (logo) formDataToSend.append('logo', logo)
      if (darkLogo) formDataToSend.append('darkLogo', darkLogo)
      const response = await fetch('/api/organization', { method: 'PUT', body: formDataToSend })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to update organization')
      }
      if (logo) setLogo(null)
      if (darkLogo) setDarkLogo(null)
      savedOrgInfo.current = { name: formData.name, domain: formData.domain, timezone: formData.timezone, currency: formData.currency, language: formData.language, industry: formData.industry, size: formData.size }
      await refetch()
      setTimeout(() => invalidateOrganizationCache(), 100)
      notifySuccess({ title: 'Organization Updated', message: 'Organization settings have been updated successfully' })
    } catch (error) {
      notifyError({ title: 'Update Failed', message: error instanceof Error ? error.message : 'Failed to update organization settings' })
    } finally {
      setSaving(false)
    }
  }

  const handleSaveRegistrationSettings = async () => {
    setSavingRegistration(true)
    try {
      const formDataToSend = new FormData()
      formDataToSend.append('data', JSON.stringify({ defaultUserRole: formData.defaultUserRole }))
      const response = await fetch('/api/organization', { method: 'PUT', body: formDataToSend })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to update registration settings')
      }
      savedRegistration.current = formData.defaultUserRole
      await refetch()
      setTimeout(() => invalidateOrganizationCache(), 100)
      notifySuccess({ title: 'Registration Settings Updated', message: 'User registration settings have been updated successfully' })
    } catch (error) {
      notifyError({ title: 'Update Failed', message: error instanceof Error ? error.message : 'Failed to update registration settings' })
    } finally {
      setSavingRegistration(false)
    }
  }

  const handleSaveTimeTrackingSettings = async () => {
    // Save button is already disabled while hasTimeTrackingLimitErrors is true; this is a
    // last-resort guard rather than the primary feedback mechanism (that's the inline field
    // errors below, updated in realtime as the user types).
    if (hasTimeTrackingLimitErrors) return
    setSavingTimeTracking(true)
    try {
      const response = await fetch('/api/time-tracking/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            ...formData.timeTracking,
            disableTimeLogEditing: formData.timeTracking.disableTimeLogEditing ?? false,
            defaultHourlyRate: parseFloat(formData.timeTracking.defaultHourlyRate) || 0,
            maxDailyHours: parseInt(formData.timeTracking.maxDailyHours) || 12,
            maxWeeklyHours: parseInt(formData.timeTracking.maxWeeklyHours) || 60,
            maxSessionHours: parseInt(formData.timeTracking.maxSessionHours) || 8,
            pastTimeLimitDays: (() => {
              const parsed = parseInt(formData.timeTracking.pastTimeLimitDays?.toString())
              return Number.isNaN(parsed) ? 30 : parsed
            })(),
            timeLogEditMode: formData.timeTracking.timeLogEditMode,
            timeLogEditDays: formData.timeTracking.timeLogEditDays ? parseInt(formData.timeTracking.timeLogEditDays.toString()) : 30,
            timeLogEditDayOfMonth: formData.timeTracking.timeLogEditDayOfMonth ? parseInt(formData.timeTracking.timeLogEditDayOfMonth.toString()) : 15,
            roundingRules: { ...formData.timeTracking.roundingRules, increment: parseInt(formData.timeTracking.roundingRules?.increment?.toString()) || 15 },
          },
        }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to update time tracking settings')
      }
      const data = await response.json()
      if (data.settings) {
        setFormData(prev => ({ ...prev, timeTracking: data.settings }))
        savedTimeTracking.current = data.settings
      }
      await refetch()
      setTimeout(() => invalidateOrganizationCache(), 100)
      notifySuccess({ title: 'Time Tracking Settings Updated', message: 'Time tracking configuration has been updated successfully' })
    } catch (error) {
      notifyError({ title: 'Update Failed', message: error instanceof Error ? error.message : 'Failed to update time tracking settings' })
    } finally {
      setSavingTimeTracking(false)
    }
  }

  const handleSaveNotificationSettings = async () => {
    setSavingNotifications(true)
    const parseRetentionDays = () => {
      const parsed = parseInt(notificationRetentionInput, 10)
      if (!Number.isNaN(parsed)) return Math.min(365, Math.max(1, parsed))
      return Math.min(365, Math.max(1, formData.notifications?.retentionDays ?? 30))
    }
    const normalizedRetentionDays = parseRetentionDays()
    try {
      const response = await fetch('/api/organization', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { notifications: { retentionDays: normalizedRetentionDays, autoCleanup: formData.notifications?.autoCleanup ?? true } } }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to update notification settings')
      }
      setFormData(prev => ({ ...prev, notifications: { ...prev.notifications, retentionDays: normalizedRetentionDays } }))
      setNotificationRetentionInput(normalizedRetentionDays.toString())
      savedNotifications.current = { retentionDays: normalizedRetentionDays, autoCleanup: formData.notifications?.autoCleanup ?? true }
      await refetch()
      setTimeout(() => invalidateOrganizationCache(), 100)
      notifySuccess({ title: 'Notification Settings Updated', message: 'Notification retention settings have been updated successfully' })
    } catch (error) {
      notifyError({ title: 'Update Failed', message: error instanceof Error ? error.message : 'Failed to update notification settings' })
    } finally {
      setSavingNotifications(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--apple-system-blue)]" />
      </div>
    )
  }

  const filteredCurrencies = currencies
    .filter(currency => {
      if (!currencySearchQuery.trim()) return true
      const q = currencySearchQuery.toLowerCase()
      return currency.code.toLowerCase().includes(q) || currency.name.toLowerCase().includes(q) ||
        currency.country.toLowerCase().includes(q) || currency.symbol.toLowerCase().includes(q)
    })
    .sort((a, b) => a.code.localeCompare(b.code))

  return (
    <div className="space-y-5">

      {/* ── Appearance ── */}
      <SectionCard
        icon={Palette}
        title="Appearance"
        description="Choose your accent color — applied across the entire app"
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(
            [
              { id: 'blue',   label: 'Blue',   color: '#3D8EFF' },
              { id: 'orange', label: 'Orange', color: '#FF7A00' },
              { id: 'purple', label: 'Purple', color: '#9B5FE8' },
              { id: 'red',    label: 'Red',    color: '#FF2D30' },
            ] as { id: AccentTheme; label: string; color: string }[]
          ).map(({ id, label, color }) => {
            const active = accentTheme === id
            return (
              <button
                key={id}
                onClick={() => updateAccentTheme(id)}
                className={`group relative flex flex-col items-center gap-2.5 p-3 rounded-[var(--apple-radius-md)] border apple-transition ${
                  active
                    ? 'border-transparent ring-2 ring-offset-2 ring-offset-card'
                    : 'border-[var(--apple-separator)] hover:border-transparent hover:ring-2 hover:ring-offset-2 hover:ring-offset-card'
                }`}
                style={{ ['--tw-ring-color' as any]: color }}
              >
                {/* Colour swatch */}
                <div
                  className="h-10 w-full rounded-[var(--apple-radius-sm)] shadow-sm"
                  style={{ backgroundColor: color }}
                />
                <span className={`text-[12px] font-semibold ${active ? 'text-[var(--apple-label)]' : 'text-[var(--apple-secondary-label)]'}`}>
                  {label}
                </span>
                {active && (
                  <span className="absolute top-2 right-2 h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                )}
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-[var(--apple-tertiary-label)]">
          Theme is saved in your browser and applied instantly — no save required.
        </p>
      </SectionCard>

      {/* ── Organization Information ── */}
      <SectionCard
        icon={Building2}
        title="Organization Information"
        description="Basic identity and locale settings"
      >
        <Field label="Organization Name *" htmlFor="org-name" error={errors.name}>
          <Input
            id="org-name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Your Company Name"
            className={errors.name ? 'border-[var(--apple-system-red)]' : ''}
          />
        </Field>

        <Field label="Website Domain" htmlFor="org-domain" error={errors.domain}
          hint="Enter your website domain or full URL (e.g., example.com or https://example.com)">
          <Input
            id="org-domain"
            value={formData.domain}
            onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
            placeholder="yourcompany.com"
            className={errors.domain ? 'border-[var(--apple-system-red)]' : ''}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Timezone" htmlFor="timezone">
            <Select value={formData.timezone} onValueChange={(v) => setFormData({ ...formData, timezone: v })}>
              <SelectTrigger id="timezone"><SelectValue /></SelectTrigger>
              <SelectContent>
                {timezones.map(tz => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Currency" htmlFor="currency">
            <Select value={formData.currency} onValueChange={(v) => { setFormData({ ...formData, currency: v }); setCurrencySearchQuery('') }}>
              <SelectTrigger id="currency"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60">
                <div className="p-2 border-b">
                  <Input
                    ref={(input) => { if (input && !currencySearchQuery) setTimeout(() => input.focus(), 100) }}
                    placeholder="Search currencies…"
                    value={currencySearchQuery}
                    onChange={(e) => { e.stopPropagation(); setCurrencySearchQuery(e.target.value) }}
                    className="h-8 text-sm"
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setCurrencySearchQuery('') }}
                    onClick={(e) => e.stopPropagation()}
                    onFocus={(e) => e.stopPropagation()}
                    autoComplete="off"
                  />
                </div>
                {currenciesLoading ? (
                  <SelectItem value="__loading__" disabled>Loading…</SelectItem>
                ) : filteredCurrencies.length === 0 ? (
                  <SelectItem value="__no-results__" disabled>No currencies found</SelectItem>
                ) : (
                  filteredCurrencies.map((c, i) => (
                    <SelectItem key={`${c.code}-${i}`} value={c.code}>{formatCurrencyDisplay(c)}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Language">
            <Select value={formData.language} onValueChange={(v) => setFormData({ ...formData, language: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {languages.map(l => <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Industry">
            <Select value={formData.industry} onValueChange={(v) => setFormData({ ...formData, industry: v })}>
              <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
              <SelectContent>
                {industries.map(ind => <SelectItem key={ind} value={ind}>{ind}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* Organization Size picker */}
        <div className="space-y-2">
          <p className="text-[13px] font-medium text-[var(--apple-label)]">Organization Size</p>
          <div className="grid grid-cols-2 gap-2">
            {organizationSizes.map(({ value, label, sub, icon: SizeIcon }) => {
              const active = formData.size === value
              return (
                <button
                  key={value}
                  onClick={() => setFormData({ ...formData, size: value as any })}
                  className={`flex items-center gap-3 p-3 rounded-[var(--apple-radius-md)] border apple-transition text-left ${
                    active
                      ? 'border-[var(--apple-system-blue)] bg-blue-50 dark:bg-blue-950/30'
                      : 'border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] hover:bg-[var(--apple-tertiary-fill)]'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-[var(--apple-radius-sm)] flex items-center justify-center flex-shrink-0 ${
                    active ? 'bg-[var(--apple-system-blue)] text-white' : 'bg-[var(--apple-tertiary-fill)] text-[var(--apple-secondary-label)]'
                  }`}>
                    <SizeIcon className="h-4 w-4" strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-[13px] font-semibold ${active ? 'text-[var(--apple-system-blue)]' : 'text-[var(--apple-label)]'}`}>{label}</p>
                    <p className="text-[11px] text-[var(--apple-tertiary-label)] truncate">{sub}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Logo */}
        <div className="space-y-3">
          <p className="text-[13px] font-medium text-[var(--apple-label)]">Organization Logo</p>

          {/* Mode selector */}
          <div className="flex gap-2">
            {(['single', 'dual'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setLogoMode(mode)}
                className={`flex-1 py-2 rounded-[var(--apple-radius-sm)] border text-[13px] font-medium apple-transition ${
                  logoMode === mode
                    ? 'border-[var(--apple-system-blue)] bg-blue-50 dark:bg-blue-950/30 text-[var(--apple-system-blue)]'
                    : 'border-[var(--apple-separator)] text-[var(--apple-secondary-label)] hover:bg-[var(--apple-tertiary-fill)]'
                }`}
              >
                {mode === 'single' ? 'Single Logo' : 'Light & Dark'}
              </button>
            ))}
          </div>

          {logoMode === 'single' ? (
            <LogoUploadSlot
              preview={logoPreview}
              label="Organization Logo"
              hint="Works in both light and dark themes"
              inputId="logo"
              onUpload={(e) => handleLogoUpload(e, 'light')}
              onRemove={() => removeLogo('light')}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <LogoUploadSlot preview={logoPreview} label="Light Mode Logo" hint="Optimized for light backgrounds"
                inputId="light-logo" onUpload={(e) => handleLogoUpload(e, 'light')} onRemove={() => removeLogo('light')} />
              <LogoUploadSlot preview={darkLogoPreview} label="Dark Mode Logo" hint="Optimized for dark backgrounds"
                inputId="dark-logo" onUpload={(e) => handleLogoUpload(e, 'dark')} onRemove={() => removeLogo('dark')} dark />
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <SaveButton loading={saving} disabled={!isFormValid || !hasOrgInfoChanges} onClick={handleSave} label="Save Organization" />
        </div>
      </SectionCard>

      {/* ── User Registration ── */}
      <SectionCard
        icon={UserCheck}
        title="User Registration"
        description="Default role assigned to newly registered users"
      >
        <Field label="Default User Role">
          <Select value={formData.defaultUserRole} onValueChange={(v) => setFormData({ ...formData, defaultUserRole: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="team_member">Team Member</SelectItem>
              <SelectItem value="project_manager">Project Manager</SelectItem>
              <SelectItem value="admin">Administrator</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <div className="flex justify-end pt-2">
          <SaveButton loading={savingRegistration} disabled={!hasRegistrationChanges} onClick={handleSaveRegistrationSettings} label="Save Registration" />
        </div>
      </SectionCard>

      {/* ── Time Tracking ── */}
      <SectionCard
        icon={Timer}
        title="Time Tracking"
        description="Global time tracking rules for your organization"
      >
        <ToggleRow
          label="Allow Time Tracking"
          description="Enable time tracking across all projects"
          checked={formData.timeTracking.allowTimeTracking}
          onCheckedChange={(v) => setFormData({ ...formData, timeTracking: { ...formData.timeTracking, allowTimeTracking: v } })}
        />

        {formData.timeTracking.allowTimeTracking && (
          <div className="space-y-4 pl-4 border-l-2 border-[var(--apple-separator)]">
            <ToggleRow
              label="Allow Manual Time Submission"
              description="Allow team members to submit time entries manually"
              checked={formData.timeTracking.allowManualTimeSubmission}
              onCheckedChange={(v) => setFormData({ ...formData, timeTracking: { ...formData.timeTracking, allowManualTimeSubmission: v } })}
            />
            {formData.timeTracking.allowManualTimeSubmission && (
              <ToggleRow
                label="Allow Members to Add Time Logs"
                description="Let non-admin roles submit their own manual time entries, subject to the past-time limit below. Admins, Super Admins, and HR can always add manual logs for anyone regardless of this setting."
                checked={formData.timeTracking.allowMembersToAddTimeLogs}
                onCheckedChange={(v) => setFormData({ ...formData, timeTracking: { ...formData.timeTracking, allowMembersToAddTimeLogs: v } })}
              />
            )}
            {formData.timeTracking.allowManualTimeSubmission && formData.timeTracking.allowMembersToAddTimeLogs && (
              <div className="pl-4 border-l-2 border-[var(--apple-separator)] space-y-3">
                <Field label="Past Time Limit (Days)" htmlFor="pastTimeLimitDays" hint="How many days back members may log time. Admins, Super Admins, and HR are never restricted by this.">
                  <Input id="pastTimeLimitDays" type="number" value={formData.timeTracking.pastTimeLimitDays}
                    onChange={(e) => setFormData({ ...formData, timeTracking: { ...formData.timeTracking, pastTimeLimitDays: e.target.value } })}
                    min="0" max="365" />
                </Field>
                <Field label="Cutoff Time" htmlFor="pastTimeLimitCutoffTime" hint="After this time each day, the oldest loggable day in the window above becomes unavailable — earlier days remain open all day.">
                  <Input id="pastTimeLimitCutoffTime" type="time" value={formData.timeTracking.pastTimeLimitCutoffTime}
                    onChange={(e) => setFormData({ ...formData, timeTracking: { ...formData.timeTracking, pastTimeLimitCutoffTime: e.target.value } })}
                  />
                </Field>
                <ToggleRow label="Allow Future Time" description="Let members log time for future dates. Admins, Super Admins, and HR can always log future dates regardless of this setting."
                  checked={formData.timeTracking.allowFutureTime}
                  onCheckedChange={(v) => setFormData({ ...formData, timeTracking: { ...formData.timeTracking, allowFutureTime: v } })}
                />
              </div>
            )}
            <ToggleRow
              label="Require Approval"
              description="Require manager approval for all time entries"
              checked={formData.timeTracking.requireApproval}
              onCheckedChange={(v) => setFormData({ ...formData, timeTracking: { ...formData.timeTracking, requireApproval: v } })}
            />
            <ToggleRow
              label="Allow Billable Time"
              description="Enable billing and cost tracking for time entries"
              checked={formData.timeTracking.allowBillableTime}
              onCheckedChange={(v) => setFormData({ ...formData, timeTracking: { ...formData.timeTracking, allowBillableTime: v } })}
            />

            {formData.timeTracking.allowBillableTime && (
              <Field label={`Default Hourly Rate (${currentCurrencySymbol})`} htmlFor="defaultHourlyRate">
                <Input
                  id="defaultHourlyRate"
                  type="number"
                  value={formData.timeTracking.defaultHourlyRate}
                  onChange={(e) => setFormData({ ...formData, timeTracking: { ...formData.timeTracking, defaultHourlyRate: e.target.value } })}
                  placeholder="0.00" step="0.01" min="0"
                />
              </Field>
            )}

            <div className="grid grid-cols-3 gap-3">
              <Field label="Max Daily Hrs" htmlFor="maxDailyHours" error={timeTrackingLimitErrors.maxDailyHours} hint="Max hours loggable in a single day">
                <Input id="maxDailyHours" type="number" value={formData.timeTracking.maxDailyHours}
                  onChange={(e) => setFormData({ ...formData, timeTracking: { ...formData.timeTracking, maxDailyHours: e.target.value } })}
                  min="1" max="24" aria-invalid={!!timeTrackingLimitErrors.maxDailyHours} />
              </Field>
              <Field label="Max Weekly Hrs" htmlFor="maxWeeklyHours" error={timeTrackingLimitErrors.maxWeeklyHours} hint="Must be at least the daily limit">
                <Input id="maxWeeklyHours" type="number" value={formData.timeTracking.maxWeeklyHours}
                  onChange={(e) => setFormData({ ...formData, timeTracking: { ...formData.timeTracking, maxWeeklyHours: e.target.value } })}
                  min="1" max="168" aria-invalid={!!timeTrackingLimitErrors.maxWeeklyHours} />
              </Field>
              <Field label="Max Session Hrs" htmlFor="maxSessionHours" error={timeTrackingLimitErrors.maxSessionHours} hint="Can't exceed the daily limit">
                <Input id="maxSessionHours" type="number" value={formData.timeTracking.maxSessionHours}
                  onChange={(e) => setFormData({ ...formData, timeTracking: { ...formData.timeTracking, maxSessionHours: e.target.value } })}
                  min="1" max="24" aria-invalid={!!timeTrackingLimitErrors.maxSessionHours} />
              </Field>
            </div>

            <ToggleRow label="Allow Overtime" description="Allow time entries beyond daily/weekly limits"
              checked={formData.timeTracking.allowOvertime}
              onCheckedChange={(v) => setFormData({ ...formData, timeTracking: { ...formData.timeTracking, allowOvertime: v } })}
            />
            <ToggleRow label="Require Category" description="Require category selection for time entries"
              checked={formData.timeTracking.requireCategory}
              onCheckedChange={(v) => setFormData({ ...formData, timeTracking: { ...formData.timeTracking, requireCategory: v } })}
            />
            {/* Time Log Editing */}
            <div className="pt-3 border-t border-[var(--apple-separator)] space-y-3">
              <p className="apple-section-label">Time Log Editing Rules</p>
              <ToggleRow label="Disable Time Log Editing" description="Prevent editing of time logs after specified timeframes"
                checked={formData.timeTracking.disableTimeLogEditing ?? false}
                onCheckedChange={(v) => setFormData({ ...formData, timeTracking: { ...formData.timeTracking, disableTimeLogEditing: v, timeLogEditMode: v ? (formData.timeTracking.timeLogEditMode || 'days') : undefined } })}
              />
              {formData.timeTracking.disableTimeLogEditing && (
                <div className="pl-4 border-l-2 border-[var(--apple-separator)] space-y-3 p-3 rounded-[var(--apple-radius-sm)] bg-[var(--apple-quaternary-fill)]">
                  <Field label="Editing Mode">
                    <Select value={formData.timeTracking.timeLogEditMode}
                      onValueChange={(v: 'days' | 'dayOfMonth') => setFormData({ ...formData, timeTracking: { ...formData.timeTracking, timeLogEditMode: v } })}>
                      <SelectTrigger><SelectValue placeholder="Select mode" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="days">Days After Creation</SelectItem>
                        <SelectItem value="dayOfMonth">Day of Month</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {formData.timeTracking.timeLogEditMode === 'days' && (
                    <Field label="Days After Creation" htmlFor="timeLogEditDays"
                      hint="Time logs can be edited within this many days after creation">
                      <Input id="timeLogEditDays" type="number" value={formData.timeTracking.timeLogEditDays}
                        onChange={(e) => setFormData({ ...formData, timeTracking: { ...formData.timeTracking, timeLogEditDays: e.target.value } })}
                        min="1" max="365" />
                    </Field>
                  )}
                  {formData.timeTracking.timeLogEditMode === 'dayOfMonth' && (
                    <Field label="Day of Month" htmlFor="timeLogEditDayOfMonth"
                      hint="Time logs can be edited until this day of the month">
                      <Input id="timeLogEditDayOfMonth" type="number" value={formData.timeTracking.timeLogEditDayOfMonth}
                        onChange={(e) => setFormData({ ...formData, timeTracking: { ...formData.timeTracking, timeLogEditDayOfMonth: e.target.value } })}
                        min="1" max="31" />
                    </Field>
                  )}
                </div>
              )}
            </div>

            {/* Rounding Rules */}
            <div className="pt-3 border-t border-[var(--apple-separator)] space-y-3">
              <p className="apple-section-label">Rounding Rules</p>
              <ToggleRow label="Enable Rounding" description="Round time entries to specified increments"
                checked={formData.timeTracking.roundingRules.enabled}
                onCheckedChange={(v) => setFormData({ ...formData, timeTracking: { ...formData.timeTracking, roundingRules: { ...formData.timeTracking.roundingRules, enabled: v } } })}
              />
              {formData.timeTracking.roundingRules.enabled && (
                <div className="pl-4 border-l-2 border-[var(--apple-separator)] space-y-3 p-3 rounded-[var(--apple-radius-sm)] bg-[var(--apple-quaternary-fill)]">
                  <Field label="Increment (minutes)" htmlFor="roundingIncrement">
                    <Input id="roundingIncrement" type="number" value={roundingIncrementInput}
                      onChange={(e) => {
                        setRoundingIncrementInput(e.target.value)
                        setFormData({ ...formData, timeTracking: { ...formData.timeTracking, roundingRules: { ...formData.timeTracking.roundingRules, increment: e.target.value } } })
                      }}
                      min="1" max="60" />
                  </Field>
                  <ToggleRow label="Round Up" description="Round up instead of down"
                    checked={formData.timeTracking.roundingRules.roundUp}
                    onCheckedChange={(v) => setFormData({ ...formData, timeTracking: { ...formData.timeTracking, roundingRules: { ...formData.timeTracking.roundingRules, roundUp: v } } })}
                  />
                </div>
              )}
            </div>

            {/* Time Tracking Notifications */}
            <div className="pt-3 border-t border-[var(--apple-separator)] space-y-3">
              <p className="apple-section-label">Time Tracking Notifications</p>
              {[
                { key: 'onTimerStart', label: 'Timer Start', desc: 'Notify when timer starts' },
                { key: 'onTimerStop', label: 'Timer Stop', desc: 'Notify when timer stops' },
                { key: 'onOvertime', label: 'Overtime Alert', desc: 'Notify when overtime is logged' },
                { key: 'onApprovalNeeded', label: 'Approval Needed', desc: 'Notify when approval is needed' },
                { key: 'onTimeSubmitted', label: 'Time Submitted', desc: 'Notify when time is submitted' },
              ].map(({ key, label, desc }) => (
                <ToggleRow key={key} label={label} description={desc}
                  checked={(formData.timeTracking.notifications as any)[key]}
                  onCheckedChange={(v) => setFormData({ ...formData, timeTracking: { ...formData.timeTracking, notifications: { ...formData.timeTracking.notifications, [key]: v } } })}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <SaveButton loading={savingTimeTracking} disabled={!hasTimeTrackingChanges || hasTimeTrackingLimitErrors} onClick={handleSaveTimeTrackingSettings} label="Save Time Tracking" />
        </div>
      </SectionCard>

      {/* ── Notifications ── */}
      <SectionCard
        icon={Bell}
        title="Notification Settings"
        description="Retention and cleanup rules for in-app notifications"
      >
        <ToggleRow
          label="Auto Cleanup"
          description="Automatically remove old notifications to save space"
          checked={formData.notifications?.autoCleanup ?? true}
          onCheckedChange={(v) => setFormData({ ...formData, notifications: { ...formData.notifications, autoCleanup: v } })}
        />

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium text-[var(--apple-label)]">Retention Period</p>
            <p className="text-[12px] text-[var(--apple-secondary-label)]">Days to keep notifications before automatic cleanup</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Input
              type="number" min="1" max="365"
              value={notificationRetentionInput}
              onChange={(e) => {
                const v = e.target.value
                if (!/^\d*$/.test(v)) return
                setNotificationRetentionInput(v)
                if (v) {
                  const n = Math.min(365, Math.max(1, parseInt(v, 10)))
                  setFormData(prev => ({ ...prev, notifications: { ...prev.notifications, retentionDays: n } }))
                }
              }}
              disabled={!formData.notifications?.autoCleanup}
              className="w-20 text-center"
            />
            <span className="text-[12px] text-[var(--apple-tertiary-label)]">days</span>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <SaveButton loading={savingNotifications} disabled={!hasNotificationChanges} onClick={handleSaveNotificationSettings} label="Save Notifications" />
        </div>
      </SectionCard>

    </div>
  )
}

/* ── Logo upload slot ── */
function LogoUploadSlot({
  preview, label, hint, inputId, onUpload, onRemove, dark = false,
}: {
  preview: string | null
  label: string
  hint: string
  inputId: string
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemove: () => void
  dark?: boolean
}) {
  return (
    <div className={`rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] p-4 flex items-center gap-4 ${dark ? 'bg-gray-900' : 'bg-[var(--apple-quaternary-fill)]'}`}>
      {preview ? (
        <div className="relative flex-shrink-0">
          <img src={preview} alt={label} className={`h-16 w-16 object-contain rounded-[var(--apple-radius-sm)] border ${dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-[var(--apple-separator)]'}`} />
          <button onClick={onRemove}
            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-[var(--apple-system-red)] flex items-center justify-center shadow apple-transition hover:scale-110">
            <X className="h-2.5 w-2.5 text-white" strokeWidth={1.5} />
          </button>
        </div>
      ) : (
        <div className={`h-16 w-16 border-2 border-dashed rounded-[var(--apple-radius-sm)] flex items-center justify-center flex-shrink-0 ${dark ? 'border-gray-600 bg-gray-800' : 'border-[var(--apple-separator)]'}`}>
          <Upload className={`h-6 w-6 ${dark ? 'text-gray-500' : 'text-[var(--apple-tertiary-label)]'}`} strokeWidth={1.5} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] font-medium ${dark ? 'text-gray-200' : 'text-[var(--apple-label)]'}`}>{label}</p>
        <p className={`text-[11px] mb-2 ${dark ? 'text-gray-400' : 'text-[var(--apple-tertiary-label)]'}`}>{hint}</p>
        <input type="file" id={inputId} accept="image/*" onChange={onUpload} className="hidden" />
        <label htmlFor={inputId}
          className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--apple-radius-sm)] border text-[12px] font-medium apple-transition ${
            dark
              ? 'border-gray-600 text-gray-200 bg-gray-800 hover:bg-gray-700'
              : 'border-[var(--apple-separator)] text-[var(--apple-secondary-label)] bg-[var(--apple-quaternary-fill)] hover:bg-[var(--apple-tertiary-fill)]'
          }`}>
          <Upload className="h-3 w-3" strokeWidth={1.5} /> Upload
        </label>
        <p className={`text-[11px] mt-1.5 ${dark ? 'text-gray-500' : 'text-[var(--apple-tertiary-label)]'}`}>Max 5MB · PNG / JPG / SVG</p>
      </div>
    </div>
  )
}

/* ── Save button ── */
function SaveButton({ loading, disabled = false, onClick, label }: {
  loading: boolean
  disabled?: boolean
  onClick: () => void
  label: string
}) {
  return (
    <Button
      onClick={onClick}
      disabled={loading || disabled}
      className="h-9 gap-2 px-4 rounded-[var(--apple-radius-sm)] apple-transition text-[13px]"
      style={{ background: 'var(--apple-card-gradient)' }}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> : <Save className="h-3.5 w-3.5" strokeWidth={1.5} />}
      {loading ? 'Saving…' : label}
    </Button>
  )
}
