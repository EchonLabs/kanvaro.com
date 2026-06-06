'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { detectClientTimezone } from '@/lib/timezone'
import { useOrganization } from '@/hooks/useOrganization'
import { useCurrencies } from '@/hooks/useCurrencies'
import { useProfile } from '@/hooks/useProfile'
import { useToast } from '@/components/ui/Toast'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { useAuthContext } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import {
  User,
  Settings,
  Bell,
  Shield,
  Save,
  Loader2,
  Palette,
  Globe,
  Mail,
  Smartphone,
  Clock,
  Eye,
  EyeOff,
  Key,
  Monitor,
  CheckCircle2,
  Camera,
  Trash2,
  Sun,
  Moon,
  Laptop,
  ChevronRight,
  Lock,
  Layers,
  Calendar,
  AlarmClock,
  PanelLeft,
  Info
} from 'lucide-react'

interface UserProfile {
  _id: string
  firstName: string
  lastName: string
  memberId: string
  email: string
  role: string
  avatar?: string
  timezone: string
  language: string
  currency: string
  preferences: {
    theme: 'light' | 'dark' | 'system'
    sidebarCollapsed: boolean
    dateFormat: string
    timeFormat: '12h' | '24h'
    notifications: {
      email: boolean
      inApp: boolean
      push: boolean
      taskReminders: boolean
      projectUpdates: boolean
      teamActivity: boolean
    }
  }
  twoFactorEnabled?: boolean
  lastLogin?: string
}

interface SessionInsight {
  id: string
  label: string
  device: string
  location?: string
  lastActive: string
  isCurrent: boolean
}

const PROFILE_TABS = [
  { id: 'personal', label: 'Personal Info', icon: User },
  { id: 'preferences', label: 'Preferences', icon: Settings },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
]

export default function ProfilePage() {
  const { user, isAuthenticated, isLoading: authLoading, setUser } = useAuthContext()

  const router = useRouter()
  const { organization, loading: orgLoading } = useOrganization()
  const { currencies, loading: currenciesLoading, formatCurrencyDisplay } = useCurrencies(true)
  const { updateProfile, changePassword, uploadAvatar, loading: profileLoading, error: profileError } = useProfile()
  const { showToast } = useToast()
  const { formatDate: formatDateDisplay, formatTime: formatTimeDisplay, setPreferences } = useDateTime()
  const { hasPermission } = usePermissions()
  const canEditProfile = hasPermission(Permission.USER_UPDATE)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [removingAvatar, setRemovingAvatar] = useState(false)
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    language: 'en',
    currency: 'USD',
    theme: 'system' as 'light' | 'dark' | 'system',
    sidebarCollapsed: false,
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h' as '12h' | '24h',
    notifications: {
      email: true,
      inApp: true,
      push: false,
      taskReminders: true,
      projectUpdates: true,
      teamActivity: false
    }
  })

  const [originalFormData, setOriginalFormData] = useState<typeof formData | null>(null)
  const [activeTab, setActiveTab] = useState('personal')
  const [browserTimezone, setBrowserTimezone] = useState(() => detectClientTimezone())
  const resolvedTimezone = browserTimezone || 'UTC'
  const [isTwoFactorModalOpen, setIsTwoFactorModalOpen] = useState(false)
  const [isSessionsModalOpen, setIsSessionsModalOpen] = useState(false)
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [twoFactorInitial, setTwoFactorInitial] = useState(false)
  const [isSavingTwoFactor, setIsSavingTwoFactor] = useState(false)
  const [currentDeviceInfo, setCurrentDeviceInfo] = useState('Current device')
  const [sessionInsights, setSessionInsights] = useState<SessionInsight[]>([])

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      // handled by fetchProfile
    } else if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/settings/user')
        const data = await response.json()
        if (data.success && data.data) {
          const profileData = data.data
          setProfile(profileData)
          setTwoFactorEnabled(!!profileData.twoFactorEnabled)
          setTwoFactorInitial(!!profileData.twoFactorEnabled)

          const newFormData = {
            firstName: profileData.firstName || '',
            lastName: profileData.lastName || '',
            language: profileData.language || 'en',
            currency: profileData.currency || 'USD',
            theme: profileData.preferences?.theme || 'system',
            sidebarCollapsed: profileData.preferences?.sidebarCollapsed || false,
            dateFormat: profileData.preferences?.dateFormat || 'MM/DD/YYYY',
            timeFormat: profileData.preferences?.timeFormat || '12h',
            notifications: {
              email: profileData.preferences?.notifications?.email ?? true,
              inApp: profileData.preferences?.notifications?.inApp ?? true,
              push: profileData.preferences?.notifications?.push ?? false,
              taskReminders: profileData.preferences?.notifications?.taskReminders ?? true,
              projectUpdates: profileData.preferences?.notifications?.projectUpdates ?? true,
              teamActivity: profileData.preferences?.notifications?.teamActivity ?? false,
            }
          }
          setFormData(newFormData)
          setOriginalFormData(newFormData)
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err)
      } finally {
        setLoading(false)
      }
    }

    if (isAuthenticated) {
      fetchProfile()
    }
  }, [isAuthenticated])

  useEffect(() => {
    setBrowserTimezone(detectClientTimezone())
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const platform = window.navigator.platform || 'Current device'
      const browser = window.navigator.userAgent || 'Browser session'
      setCurrentDeviceInfo(`${platform} • ${browser}`)
    }
  }, [])

  useEffect(() => {
    const lastActiveTimestamp = profile?.lastLogin || new Date().toISOString()
    setSessionInsights([
      {
        id: 'current-session',
        label: 'Current Session',
        device: currentDeviceInfo,
        location: resolvedTimezone,
        lastActive: lastActiveTimestamp,
        isCurrent: true
      }
    ])
  }, [currentDeviceInfo, profile?.lastLogin, resolvedTimezone])

  const handleSave = async () => {
    let successMessage = ''
    switch (activeTab) {
      case 'personal': successMessage = 'Personal information updated successfully'; break
      case 'preferences': successMessage = 'Display preferences updated successfully'; break
      case 'notifications': successMessage = 'Notification preferences updated successfully'; break
      default: successMessage = 'Profile updated successfully'
    }

    const result = await updateProfile(formData)
    if (result.success) {
      setProfile(prev => prev ? { ...prev, ...result.data } : null)
      setOriginalFormData(JSON.parse(JSON.stringify(formData)))
      setPreferences({
        dateFormat: formData.dateFormat as 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD',
        timeFormat: formData.timeFormat as '12h' | '24h',
        timezone: resolvedTimezone
      })
      showToast({ type: 'success', title: 'Profile Updated', message: successMessage, duration: 4000 })
    }
  }

  const twoFactorDirty = twoFactorEnabled !== twoFactorInitial

  const handleTwoFactorSave = async () => {
    if (!twoFactorDirty || isSavingTwoFactor) return
    setIsSavingTwoFactor(true)
    try {
      const response = await fetch('/api/settings/security', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ twoFactorEnabled })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error || 'Failed to update 2FA settings')
      }

      setTwoFactorInitial(twoFactorEnabled)
      showToast({
        type: 'success',
        title: 'Security Updated',
        message: `Two-factor authentication ${twoFactorEnabled ? 'enabled' : 'disabled'} successfully.`,
        duration: 4000
      })
    } catch (error: any) {
      showToast({ type: 'error', title: 'Update Failed', message: error.message || 'Could not update two-factor settings.', duration: 4000 })
    } finally {
      setIsSavingTwoFactor(false)
    }
  }

  const handlePasswordChange = async () => {
    const result = await changePassword(passwordData)
    if (result.success) {
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setShowPassword(false)
      setShowNewPassword(false)
      setShowConfirmPassword(false)
      showToast({
        type: 'success',
        title: 'Password Changed',
        message: 'Your password has been updated successfully.',
        duration: 5000
      })
    }
  }

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const result = await uploadAvatar(file)
      if (result.success) {
        setProfile(prev => prev ? { ...prev, avatar: result.data?.avatar } : null)
        if (result.data && user) setUser({ ...user, avatar: result.data.avatar })
        showToast({ type: 'success', title: 'Avatar Updated', message: 'Your profile picture has been updated.', duration: 4000 })
      }
    }
  }

  const handleRemoveAvatar = async () => {
    if (!profile) return
    try {
      setRemovingAvatar(true)
      const response = await fetch('/api/profile/avatar', { method: 'DELETE' })
      const result = await response.json()

      if (result.success) {
        setProfile(prev => prev ? { ...prev, avatar: result.data?.avatar } : null)
        if (result.data && user) setUser({ ...user, avatar: result.data.avatar })
        showToast({ type: 'success', title: 'Avatar Removed', message: 'Your avatar has been removed.', duration: 4000 })
      } else {
        showToast({ type: 'error', title: 'Error', message: result.error || 'Failed to remove avatar.', duration: 4000 })
      }
    } catch (error) {
      showToast({ type: 'error', title: 'Error', message: 'Failed to remove avatar.', duration: 4000 })
    } finally {
      setRemovingAvatar(false)
    }
  }

  const handleNavigateToSecurity = (section: 'twoFactor' | 'sessions') => {
    if (section === 'twoFactor') setIsTwoFactorModalOpen(false)
    else setIsSessionsModalOpen(false)
    router.push(`/security?section=${section}`)
  }

  const hasChanges = () => {
    if (!originalFormData) return false
    switch (activeTab) {
      case 'personal':
        return (
          formData.firstName !== originalFormData.firstName ||
          formData.lastName !== originalFormData.lastName ||
          formData.language !== originalFormData.language
        )
      case 'preferences':
        return (
          formData.theme !== originalFormData.theme ||
          formData.dateFormat !== originalFormData.dateFormat ||
          formData.timeFormat !== originalFormData.timeFormat ||
          formData.sidebarCollapsed !== originalFormData.sidebarCollapsed
        )
      case 'notifications':
        return JSON.stringify(formData.notifications) !== JSON.stringify(originalFormData.notifications)
      default:
        return false
    }
  }

  // ─── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <MainLayout>
        <div className="space-y-8">
          {/* Header skeleton */}
          <div className="flex items-start gap-5 pb-6 border-b border-[var(--apple-separator)]">
            <div className="w-14 h-14 rounded-[var(--apple-radius-lg)] bg-[var(--apple-tertiary-fill)] animate-pulse shrink-0" />
            <div className="space-y-2 pt-1">
              <div className="h-7 w-36 rounded-lg bg-[var(--apple-tertiary-fill)] animate-pulse" />
              <div className="h-4 w-64 rounded-md bg-[var(--apple-tertiary-fill)] animate-pulse" />
            </div>
          </div>
          {/* Tabs skeleton */}
          <div className="h-10 w-96 rounded-[var(--apple-radius-md)] bg-[var(--apple-tertiary-fill)] animate-pulse" />
          {/* Card skeleton */}
          <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-6 space-y-5">
            <div className="h-5 w-44 rounded bg-[var(--apple-tertiary-fill)] animate-pulse" />
            <div className="h-[120px] w-full rounded-[var(--apple-radius-md)] bg-[var(--apple-tertiary-fill)] animate-pulse" />
            <div className="grid grid-cols-2 gap-4">
              <div className="h-10 rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)] animate-pulse" />
              <div className="h-10 rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)] animate-pulse" />
            </div>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (!profile) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64 text-[var(--apple-secondary-label)]">
          No user data available.
        </div>
      </MainLayout>
    )
  }

  const initials = `${profile.firstName?.[0] ?? ''}${profile.lastName?.[0] ?? ''}`.toUpperCase()

  return (
    <MainLayout>
      <div className="space-y-8">

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div className="flex items-start gap-4 pb-6 border-b border-[var(--apple-separator)]">
          <div
            className="w-14 h-14 rounded-[var(--apple-radius-lg)] flex items-center justify-center shrink-0 shadow-[0_4px_16px_rgba(0,122,255,0.28)]"
            style={{ background: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)' }}
          >
            <User className="h-7 w-7 text-white" strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight text-[var(--apple-label)]">
              Profile
            </h1>
            <p className="text-[15px] text-[var(--apple-secondary-label)] mt-0.5 truncate">
              {organization
                ? `Manage your personal information for ${organization.name}`
                : 'Manage your personal information and preferences'}
            </p>
          </div>
        </div>

        {profileError && (
          <Alert variant="destructive">
            <AlertDescription>{profileError}</AlertDescription>
          </Alert>
        )}

        {/* ── Segmented tab bar ─────────────────────────────────────────────── */}
        <div className="flex w-full items-center gap-0.5 p-0.5 rounded-full bg-[var(--apple-tertiary-fill)]">
          {PROFILE_TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 h-9 px-2 sm:px-3 rounded-full text-[13px] font-medium apple-transition select-none min-w-0',
                  isActive
                    ? 'bg-card text-[var(--apple-label)] shadow-sm'
                    : 'text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]'
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline truncate">{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* ────────────────────────────────────────────────────────────────────
            PERSONAL INFO
        ──────────────────────────────────────────────────────────────────── */}
        {activeTab === 'personal' && (
          <div className="space-y-5 view-transition-container">

            {/* Avatar card */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
              {/* Full gradient banner — hard at top, dissolves to card bg at bottom */}
              <div className="
                px-6 py-6
                bg-gradient-to-b
                from-zinc-200 via-zinc-100 to-white
                dark:from-zinc-700 dark:via-zinc-800 dark:to-zinc-900
              ">
                <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                  {/* Avatar */}
                  <div className="relative shrink-0 self-start sm:self-auto">
                    <div className="rounded-full ring-4 ring-white/60 dark:ring-zinc-900/60 shadow-lg overflow-hidden">
                      <GravatarAvatar
                        user={{ avatar: profile.avatar, firstName: profile.firstName, lastName: profile.lastName, email: profile.email }}
                        size={80}
                        className="h-20 w-20"
                      />
                    </div>
                    {canEditProfile && (
                      <label
                        htmlFor="avatar-upload"
                        className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-[var(--apple-system-blue)] flex items-center justify-center cursor-pointer shadow-md apple-transition hover:scale-110"
                      >
                        <Camera className="h-3.5 w-3.5 text-white" />
                        <input
                          type="file"
                          id="avatar-upload"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          onChange={handleAvatarUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  {/* Identity */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[19px] font-semibold text-zinc-900 dark:text-zinc-50 leading-snug">
                      {profile.firstName} {profile.lastName}
                    </p>
                    <p className="text-[13px] text-zinc-600 dark:text-zinc-400">{profile.email}</p>
                    <p className="text-[11px] font-semibold tracking-[0.06em] uppercase text-zinc-400 dark:text-zinc-500 mt-0.5">
                      ID: {profile.memberId}
                    </p>
                  </div>

                  {/* Avatar actions */}
                  {canEditProfile && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveAvatar}
                      disabled={removingAvatar}
                      className="text-[var(--apple-system-red)] hover:text-[var(--apple-system-red)] hover:bg-red-100/60 dark:hover:bg-red-950/30 text-[13px] shrink-0 self-start sm:self-auto"
                    >
                      {removingAvatar
                        ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Removing…</>
                        : <><Trash2 className="mr-1.5 h-3.5 w-3.5" />Remove</>}
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-4">
                  JPG, PNG, GIF or WebP · Max 2 MB
                </p>
              </div>
            </div>

            {/* Personal details card */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none">
              <div className="px-5 pt-5 pb-2">
                <p className="apple-section-label">Personal Details</p>
              </div>
              <div className="px-5 pb-5 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName" className="text-[13px] font-medium text-[var(--apple-label)]">First Name</Label>
                    <Input
                      id="firstName"
                      value={formData.firstName}
                      onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                      placeholder="First name"
                      disabled={!canEditProfile}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName" className="text-[13px] font-medium text-[var(--apple-label)]">Last Name</Label>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                      placeholder="Last name"
                      disabled={!canEditProfile}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-[13px] font-medium text-[var(--apple-label)]">Email Address</Label>
                  <div className="relative">
                    <Input
                      id="email"
                      type="email"
                      value={profile.email}
                      disabled
                      className="pr-10 text-[var(--apple-secondary-label)] cursor-not-allowed"
                    />
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--apple-tertiary-label)]" />
                  </div>
                  <p className="text-[11px] text-[var(--apple-tertiary-label)]">Email address cannot be changed.</p>
                </div>
              </div>
            </div>

            {/* Region card */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none">
              <div className="px-5 pt-5 pb-2">
                <p className="apple-section-label">Region & Language</p>
              </div>
              <div className="px-5 pb-5 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-medium text-[var(--apple-label)]">Timezone</Label>
                  <div className="relative">
                    <Input
                      value={resolvedTimezone}
                      disabled
                      className="pr-10 text-[var(--apple-secondary-label)] cursor-not-allowed"
                    />
                    <Globe className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--apple-tertiary-label)]" />
                  </div>
                  <p className="text-[11px] text-[var(--apple-tertiary-label)]">Automatically follows your device timezone.</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="language" className="text-[13px] font-medium text-[var(--apple-label)]">Language</Label>
                  <Select value={formData.language} onValueChange={(value) => setFormData(prev => ({ ...prev, language: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="de">German</SelectItem>
                      <SelectItem value="it">Italian</SelectItem>
                      <SelectItem value="pt">Portuguese</SelectItem>
                      <SelectItem value="ja">Japanese</SelectItem>
                      <SelectItem value="ko">Korean</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────────────
            PREFERENCES
        ──────────────────────────────────────────────────────────────────── */}
        {activeTab === 'preferences' && (
          <div className="space-y-5 view-transition-container">

            {/* Theme picker */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none">
              <div className="px-5 pt-5 pb-3">
                <p className="apple-section-label">Appearance</p>
              </div>
              <div className="px-5 pb-5">
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { value: 'light', label: 'Light', Icon: Sun, gradient: 'linear-gradient(135deg,#FF9500 0%,#FFD60A 100%)', glow: 'rgba(255,149,0,0.22)' },
                    { value: 'dark', label: 'Dark', Icon: Moon, gradient: 'linear-gradient(135deg,#007AFF 0%,#BF5AF2 100%)', glow: 'rgba(0,122,255,0.22)' },
                    { value: 'system', label: 'System', Icon: Laptop, gradient: 'linear-gradient(135deg,#34C759 0%,#30B0C7 100%)', glow: 'rgba(52,199,89,0.22)' },
                  ] as const).map(({ value, label, Icon, gradient, glow }) => {
                    const active = formData.theme === value
                    return (
                      <button
                        key={value}
                        onClick={() => setFormData(prev => ({ ...prev, theme: value }))}
                        className={cn(
                          'relative flex flex-col items-center gap-2.5 py-4 px-3 rounded-[var(--apple-radius-md)] border apple-transition',
                          active
                            ? 'border-[var(--apple-system-blue)] bg-blue-50/50 dark:bg-blue-950/20 shadow-[0_0_0_2px_var(--apple-system-blue)]'
                            : 'border-[var(--apple-separator)] hover:bg-[var(--apple-quaternary-fill)]'
                        )}
                      >
                        <div
                          className="w-10 h-10 rounded-[var(--apple-radius-sm)] flex items-center justify-center shadow-sm"
                          style={{
                            background: gradient,
                            boxShadow: active ? `0 4px 12px ${glow}` : undefined
                          }}
                        >
                          <Icon className="h-5 w-5 text-white" strokeWidth={1.75} />
                        </div>
                        <span className={cn('text-[13px] font-medium', active ? 'text-[var(--apple-system-blue)]' : 'text-[var(--apple-label)]')}>
                          {label}
                        </span>
                        {active && (
                          <CheckCircle2 className="absolute top-2 right-2 h-4 w-4 text-[var(--apple-system-blue)]" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Date & Time card */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none">
              <div className="px-5 pt-5 pb-3">
                <p className="apple-section-label">Date & Time</p>
              </div>
              <div className="px-5 pb-5 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-medium text-[var(--apple-label)] flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-[var(--apple-secondary-label)]" />
                    Date Format
                  </Label>
                  <Select value={formData.dateFormat} onValueChange={(value) => setFormData(prev => ({ ...prev, dateFormat: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (US)</SelectItem>
                      <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (EU)</SelectItem>
                      <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (ISO)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[13px] font-medium text-[var(--apple-label)] flex items-center gap-1.5">
                    <AlarmClock className="h-3.5 w-3.5 text-[var(--apple-secondary-label)]" />
                    Time Format
                  </Label>
                  <Select value={formData.timeFormat} onValueChange={(value: '12h' | '24h') => setFormData(prev => ({ ...prev, timeFormat: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="12h">12-hour (AM/PM)</SelectItem>
                      <SelectItem value="24h">24-hour</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Layout card */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none">
              <div className="px-5 pt-5 pb-3">
                <p className="apple-section-label">Layout</p>
              </div>
              <div className="px-5 pb-5">
                <div className="flex items-center justify-between py-3 rounded-[var(--apple-radius-sm)] px-4 bg-[var(--apple-quaternary-fill)]">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-[8px] flex items-center justify-center bg-[var(--apple-tertiary-fill)]">
                      <PanelLeft className="h-4 w-4 text-[var(--apple-secondary-label)]" />
                    </div>
                    <div>
                      <p className="text-[14px] font-medium text-[var(--apple-label)]">Collapsed Sidebar</p>
                      <p className="text-[12px] text-[var(--apple-secondary-label)]">Start with sidebar collapsed by default</p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.sidebarCollapsed}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, sidebarCollapsed: checked }))}
                  />
                </div>
              </div>
            </div>

            {/* Info callout */}
            <div className="flex items-start gap-3 p-4 rounded-[var(--apple-radius-md)] bg-blue-50 dark:bg-blue-950/25 border border-blue-200 dark:border-blue-800">
              <Info className="h-4 w-4 text-[var(--apple-system-blue)] shrink-0 mt-0.5" />
              <p className="text-[13px] text-blue-800 dark:text-blue-200">
                Date and time format changes apply immediately across the entire application, including time entry fields and log displays.
              </p>
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────────────
            NOTIFICATIONS
        ──────────────────────────────────────────────────────────────────── */}
        {activeTab === 'notifications' && (
          <div className="space-y-5 view-transition-container">

            {/* Channels */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none">
              <div className="px-5 pt-5 pb-2">
                <p className="apple-section-label">Notification Channels</p>
              </div>
              <div className="px-5 pb-5 space-y-2">
                {([
                  {
                    key: 'email' as const,
                    label: 'Email',
                    desc: 'Receive notifications via email',
                    icon: Mail,
                    gradient: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)'
                  },
                  {
                    key: 'inApp' as const,
                    label: 'In-App',
                    desc: 'Show notifications inside the application',
                    icon: Monitor,
                    gradient: 'linear-gradient(135deg,#34C759 0%,#30D158 100%)'
                  },
                  {
                    key: 'push' as const,
                    label: 'Push',
                    desc: 'Browser push notifications',
                    icon: Smartphone,
                    gradient: 'linear-gradient(135deg,#BF5AF2 0%,#FF375F 100%)'
                  },
                ]).map(({ key, label, desc, icon: Icon, gradient }) => (
                  <div key={key} className="flex items-center justify-between p-3.5 rounded-[var(--apple-radius-sm)] hover:bg-[var(--apple-quaternary-fill)] apple-transition group">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0"
                        style={{ background: gradient }}
                      >
                        <Icon className="h-4 w-4 text-white" strokeWidth={1.75} />
                      </div>
                      <div>
                        <p className="text-[14px] font-medium text-[var(--apple-label)]">{label} Notifications</p>
                        <p className="text-[12px] text-[var(--apple-secondary-label)]">{desc}</p>
                      </div>
                    </div>
                    <Switch
                      checked={formData.notifications[key]}
                      onCheckedChange={(checked) => setFormData(prev => ({
                        ...prev,
                        notifications: { ...prev.notifications, [key]: checked }
                      }))}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Activity preferences */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none">
              <div className="px-5 pt-5 pb-2">
                <p className="apple-section-label">Activity Preferences</p>
              </div>
              <div className="px-5 pb-5 space-y-2">
                {([
                  {
                    key: 'taskReminders' as const,
                    label: 'Task Reminders',
                    desc: 'Get reminded about upcoming deadlines',
                    icon: Clock,
                    gradient: 'linear-gradient(135deg,#FF9500 0%,#FFD60A 100%)'
                  },
                  {
                    key: 'projectUpdates' as const,
                    label: 'Project Updates',
                    desc: 'Notified about project status changes',
                    icon: Globe,
                    gradient: 'linear-gradient(135deg,#30B0C7 0%,#64D2FF 100%)'
                  },
                  {
                    key: 'teamActivity' as const,
                    label: 'Team Activity',
                    desc: 'Updates on team member actions',
                    icon: User,
                    gradient: 'linear-gradient(135deg,#AF52DE 0%,#BF5AF2 100%)'
                  },
                ]).map(({ key, label, desc, icon: Icon, gradient }) => (
                  <div key={key} className="flex items-center justify-between p-3.5 rounded-[var(--apple-radius-sm)] hover:bg-[var(--apple-quaternary-fill)] apple-transition">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0"
                        style={{ background: gradient }}
                      >
                        <Icon className="h-4 w-4 text-white" strokeWidth={1.75} />
                      </div>
                      <div>
                        <p className="text-[14px] font-medium text-[var(--apple-label)]">{label}</p>
                        <p className="text-[12px] text-[var(--apple-secondary-label)]">{desc}</p>
                      </div>
                    </div>
                    <Switch
                      checked={formData.notifications[key]}
                      onCheckedChange={(checked) => setFormData(prev => ({
                        ...prev,
                        notifications: { ...prev.notifications, [key]: checked }
                      }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────────────
            SECURITY
        ──────────────────────────────────────────────────────────────────── */}
        {activeTab === 'security' && (
          <div className="space-y-5 view-transition-container">

            {/* Change password */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none">
              <div className="px-5 pt-5 pb-2 flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg,#FF9500 0%,#FFD60A 100%)' }}
                >
                  <Key className="h-4 w-4 text-white" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-[var(--apple-label)]">Change Password</p>
                  <p className="text-[12px] text-[var(--apple-secondary-label)]">Use a strong password with at least 8 characters</p>
                </div>
              </div>
              <div className="px-5 pb-5 pt-3 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="currentPassword" className="text-[13px] font-medium text-[var(--apple-label)]">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showPassword ? 'text' : 'password'}
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                      placeholder="Enter current password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--apple-tertiary-label)] hover:text-[var(--apple-secondary-label)] apple-transition"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="newPassword" className="text-[13px] font-medium text-[var(--apple-label)]">New Password</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? 'text' : 'password'}
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                        placeholder="New password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--apple-tertiary-label)] hover:text-[var(--apple-secondary-label)] apple-transition"
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirmPassword" className="text-[13px] font-medium text-[var(--apple-label)]">Confirm Password</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        placeholder="Confirm new password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--apple-tertiary-label)] hover:text-[var(--apple-secondary-label)] apple-transition"
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <Button
                    onClick={handlePasswordChange}
                    disabled={profileLoading || !passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword}
                    className="gap-2"
                  >
                    {profileLoading
                      ? <><Loader2 className="h-4 w-4 animate-spin" />Changing…</>
                      : <><Key className="h-4 w-4" />Change Password</>}
                  </Button>
                </div>
              </div>
            </div>

            {/* Two-Factor Authentication */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none">
              <div className="px-5 pt-5 pb-2 flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg,#34C759 0%,#30D158 100%)' }}
                >
                  <Shield className="h-4 w-4 text-white" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-[var(--apple-label)]">Two-Factor Authentication</p>
                  <p className="text-[12px] text-[var(--apple-secondary-label)]">Add an extra layer of security to your account</p>
                </div>
              </div>
              <div className="px-5 pb-5 pt-3 space-y-4">
                <div className="flex items-center justify-between p-4 rounded-[var(--apple-radius-sm)] bg-[var(--apple-quaternary-fill)]">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-2 h-2 rounded-full',
                      twoFactorEnabled ? 'bg-[var(--apple-system-green)]' : 'bg-[var(--apple-system-orange)]'
                    )} style={{ animation: 'status-pulse 2s ease-in-out infinite' }} />
                    <div>
                      <p className="text-[14px] font-medium text-[var(--apple-label)]">Enable 2FA Protection</p>
                      <p className="text-[12px] text-[var(--apple-secondary-label)]">
                        Currently{' '}
                        <span className={twoFactorEnabled ? 'text-[var(--apple-system-green)]' : 'text-[var(--apple-system-orange)]'}>
                          {twoFactorEnabled ? 'enabled' : 'disabled'}
                        </span>
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={twoFactorEnabled}
                    onCheckedChange={setTwoFactorEnabled}
                    aria-label="Toggle two-factor authentication"
                  />
                </div>

                <div className="flex flex-wrap gap-2 justify-end pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsTwoFactorModalOpen(true)}
                    disabled={!twoFactorDirty}
                    className="gap-1.5"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    Manage 2FA
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsSessionsModalOpen(true)}
                    className="gap-1.5"
                  >
                    <Monitor className="h-3.5 w-3.5" />
                    View Sessions
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleTwoFactorSave}
                    disabled={!twoFactorDirty || isSavingTwoFactor}
                    className="gap-1.5"
                  >
                    {isSavingTwoFactor
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</>
                      : <><Save className="h-3.5 w-3.5" />Save 2FA Settings</>}
                  </Button>
                </div>
              </div>
            </div>

            {/* Active sessions info card */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none">
              <div className="px-5 pt-5 pb-2 flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)' }}
                >
                  <Monitor className="h-4 w-4 text-white" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-[var(--apple-label)]">Active Sessions</p>
                  <p className="text-[12px] text-[var(--apple-secondary-label)]">Devices currently signed in to your account</p>
                </div>
              </div>
              <div className="px-5 pb-5 pt-3">
                <button
                  onClick={() => setIsSessionsModalOpen(true)}
                  className="w-full flex items-center justify-between p-3.5 rounded-[var(--apple-radius-sm)] bg-[var(--apple-quaternary-fill)] hover:bg-[var(--apple-tertiary-fill)] apple-transition group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-[var(--apple-system-green)]" style={{ animation: 'status-pulse 2s ease-in-out infinite' }} />
                    <span className="text-[14px] text-[var(--apple-label)]">Current session active</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-[var(--apple-secondary-label)] group-hover:translate-x-0.5 apple-transition" />
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── 2FA Dialog ────────────────────────────────────────────────────── */}
      <Dialog open={isTwoFactorModalOpen} onOpenChange={setIsTwoFactorModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              Protect your account by requiring a one-time code when you sign in.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] p-4 bg-[var(--apple-quaternary-fill)]">
              <p className="text-[13px] font-medium text-[var(--apple-label)]">
                Current status:{' '}
                <span className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold',
                  twoFactorEnabled
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                )}>
                  {twoFactorEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </p>
              <p className="text-[12px] text-[var(--apple-secondary-label)] mt-2">
                Manage authenticators and backup codes from the Security Center.
              </p>
            </div>
            <div className="space-y-2 text-[13px]">
              <p className="font-medium text-[var(--apple-label)]">Getting started</p>
              <ol className="list-decimal pl-5 space-y-1 text-[var(--apple-secondary-label)]">
                <li>Open the Security Center from the button below.</li>
                <li>Toggle 2FA on and scan the QR code with your authenticator app.</li>
                <li>Enter the generated code and save your backup codes.</li>
              </ol>
            </div>
            <Alert>
              <AlertDescription>
                Recommended: Google Authenticator, 1Password, or Microsoft Authenticator.
              </AlertDescription>
            </Alert>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTwoFactorModalOpen(false)}>Close</Button>
            <Button onClick={() => handleNavigateToSecurity('twoFactor')}>Open Security Center</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Sessions Dialog ───────────────────────────────────────────────── */}
      <Dialog open={isSessionsModalOpen} onOpenChange={setIsSessionsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Active Sessions</DialogTitle>
            <DialogDescription>
              Review devices that are currently signed in to your account.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {sessionInsights.length === 0 ? (
              <p className="text-[13px] text-[var(--apple-secondary-label)]">No sessions detected for your account.</p>
            ) : (
              sessionInsights.map((session) => (
                <div key={session.id} className="rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] p-4 space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-[var(--apple-label)]">{session.label}</p>
                      <p className="text-[12px] text-[var(--apple-secondary-label)] break-words mt-0.5">{session.device}</p>
                    </div>
                    <span className={cn(
                      'shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold',
                      session.isCurrent
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'bg-[var(--apple-tertiary-fill)] text-[var(--apple-secondary-label)]'
                    )}>
                      {session.isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-[var(--apple-system-green)]" />}
                      {session.isCurrent ? 'Current device' : 'Signed in'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--apple-tertiary-label)]">
                    Last active: {formatDateDisplay(session.lastActive)} at {formatTimeDisplay(session.lastActive)}
                    {session.location ? ` · ${session.location}` : ''}
                  </p>
                </div>
              ))
            )}
            <Alert>
              <AlertDescription>
                Need to sign out another device? Jump into the Security Center to revoke access.
              </AlertDescription>
            </Alert>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSessionsModalOpen(false)}>Close</Button>
            <Button onClick={() => handleNavigateToSecurity('sessions')}>Open Security Center</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ── Floating pill save bar ────────────────────────────────────────── */}
      {activeTab !== 'security' && (
        <div className={cn(
          'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 apple-transition',
          hasChanges()
            ? 'translate-y-0 opacity-100'
            : 'translate-y-4 opacity-0 pointer-events-none'
        )}>
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-full bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl backdrop-saturate-[180%] border border-white/50 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.16)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.55)] ring-1 ring-black/5 dark:ring-white/5">
            <span className="text-[13px] text-[var(--apple-secondary-label)] pl-1 whitespace-nowrap">Unsaved changes</span>
            <div className="w-px h-4 bg-[var(--apple-separator)]" />
            <button
              onClick={() => originalFormData && setFormData(JSON.parse(JSON.stringify(originalFormData)))}
              className="text-[13px] font-medium text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] apple-transition px-1"
            >
              Discard
            </button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={profileLoading}
              className="rounded-full h-7 px-3.5 text-[13px] gap-1.5"
            >
              {profileLoading
                ? <><Loader2 className="h-3 w-3 animate-spin" />Saving…</>
                : <><Save className="h-3 w-3" />Save</>}
            </Button>
          </div>
        </div>
      )}

    </MainLayout>
  )
}
