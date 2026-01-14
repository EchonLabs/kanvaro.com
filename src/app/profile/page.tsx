'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { useOrganization } from '@/hooks/useOrganization'
import { useCurrencies } from '@/hooks/useCurrencies'
import { useProfile } from '@/hooks/useProfile'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { useToast } from '@/components/ui/Toast'
import { detectClientTimezone } from '@/lib/timezone'
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
  Smartphone as Mobile,
  Monitor,
  Laptop,
  Tablet,
  ArrowLeft
} from 'lucide-react'

interface UserProfile {
  _id: string
  firstName: string
  lastName: string
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

export default function ProfilePage() {
  const router = useRouter()
  const { organization, loading: orgLoading } = useOrganization()
  const { currencies, loading: currenciesLoading, formatCurrencyDisplay } = useCurrencies(true)
  const { updateProfile, changePassword, uploadAvatar, loading: profileLoading, error: profileError, success: profileSuccess } = useProfile()
  const { showToast } = useToast()
  const { formatDate: formatDateDisplay, formatTime: formatTimeDisplay, setPreferences } = useDateTime()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
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

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      
      if (response.ok) {
        const userData = await response.json()
        setProfile(userData)
        const twoFactorState = !!userData.twoFactorEnabled
        setTwoFactorEnabled(twoFactorState)
        setTwoFactorInitial(twoFactorState)
        const loadedDateFormat = userData.preferences?.notifications?.dateFormat || userData.preferences?.dateFormat || 'MM/DD/YYYY'
        const loadedTimeFormat = userData.preferences?.notifications?.timeFormat || userData.preferences?.timeFormat || '12h'

        setFormData({
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          language: userData.language || 'en',
          currency: userData.currency || 'USD',
          theme: userData.preferences?.theme || 'system',
          sidebarCollapsed: userData.preferences?.sidebarCollapsed || false,
          dateFormat: loadedDateFormat,
          timeFormat: loadedTimeFormat,
          notifications: {
            email: userData.preferences?.notifications?.email ?? true,
            inApp: userData.preferences?.notifications?.inApp ?? true,
            push: userData.preferences?.notifications?.push ?? false,
            taskReminders: userData.preferences?.notifications?.taskReminders ?? true,
            projectUpdates: userData.preferences?.notifications?.projectUpdates ?? true,
            teamActivity: userData.preferences?.notifications?.teamActivity ?? false
          }
        })

        // Update DateTimeProvider with loaded preferences
        const timezonePreference = browserTimezone || 'UTC'
        setPreferences({
          dateFormat: loadedDateFormat as 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD',
          timeFormat: loadedTimeFormat as '12h' | '24h',
          timezone: timezonePreference
        })

        setAuthError('')
        // Store original form data for change detection
        setOriginalFormData(JSON.parse(JSON.stringify({
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          language: userData.language || 'en',
          currency: userData.currency || 'USD',
          theme: userData.preferences?.theme || 'system',
          sidebarCollapsed: userData.preferences?.sidebarCollapsed || false,
          dateFormat: loadedDateFormat,
          timeFormat: loadedTimeFormat,
          notifications: {
            email: userData.preferences?.notifications?.email ?? true,
            inApp: userData.preferences?.notifications?.inApp ?? true,
            push: userData.preferences?.notifications?.push ?? false,
            taskReminders: userData.preferences?.notifications?.taskReminders ?? true,
            projectUpdates: userData.preferences?.notifications?.projectUpdates ?? true,
            teamActivity: userData.preferences?.notifications?.teamActivity ?? false
          }
        })))
        } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json()
          setProfile(refreshData)
          const refreshTwoFactorState = !!refreshData.twoFactorEnabled
          setTwoFactorEnabled(refreshTwoFactorState)
          setTwoFactorInitial(refreshTwoFactorState)
          const refreshDateFormat = refreshData.preferences?.notifications?.dateFormat || refreshData.preferences?.dateFormat || 'MM/DD/YYYY'
          const refreshTimeFormat = refreshData.preferences?.notifications?.timeFormat || refreshData.preferences?.timeFormat || '12h'

          setFormData({
            firstName: refreshData.firstName || '',
            lastName: refreshData.lastName || '',
            language: refreshData.language || 'en',
            currency: refreshData.currency || 'USD',
            theme: refreshData.preferences?.theme || 'system',
            sidebarCollapsed: refreshData.preferences?.sidebarCollapsed || false,
            dateFormat: refreshDateFormat,
            timeFormat: refreshTimeFormat,
            notifications: {
              email: refreshData.preferences?.notifications?.email ?? true,
              inApp: refreshData.preferences?.notifications?.inApp ?? true,
              push: refreshData.preferences?.notifications?.push ?? false,
              taskReminders: refreshData.preferences?.notifications?.taskReminders ?? true,
              projectUpdates: refreshData.preferences?.notifications?.projectUpdates ?? true,
              teamActivity: refreshData.preferences?.notifications?.teamActivity ?? false
            }
          })

          // Update DateTimeProvider with loaded preferences
          const timezonePreference = browserTimezone || 'UTC'
          setPreferences({
            dateFormat: refreshDateFormat as 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD',
            timeFormat: refreshTimeFormat as '12h' | '24h',
            timezone: timezonePreference
          })

          setAuthError('')
          // Store original form data for change detection
          setOriginalFormData(JSON.parse(JSON.stringify({
            firstName: refreshData.firstName || '',
            lastName: refreshData.lastName || '',
            language: refreshData.language || 'en',
            currency: refreshData.currency || 'USD',
            theme: refreshData.preferences?.theme || 'system',
            sidebarCollapsed: refreshData.preferences?.sidebarCollapsed || false,
            dateFormat: refreshDateFormat,
            timeFormat: refreshTimeFormat,
            notifications: {
              email: refreshData.preferences?.notifications?.email ?? true,
              inApp: refreshData.preferences?.notifications?.inApp ?? true,
              push: refreshData.preferences?.notifications?.push ?? false,
              taskReminders: refreshData.preferences?.notifications?.taskReminders ?? true,
              projectUpdates: refreshData.preferences?.notifications?.projectUpdates ?? true,
              teamActivity: refreshData.preferences?.notifications?.teamActivity ?? false
            }
          })))
        } else {
          setAuthError('Session expired')
          setTimeout(() => {
            router.push('/login')
          }, 2000)
        }
      } else {
        router.push('/login')
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      setAuthError('Authentication failed')
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    } finally {
      setLoading(false)
    }
  }, [router, browserTimezone])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

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
    // Generate tab-specific success message
    let successMessage = ''
    switch (activeTab) {
      case 'personal':
        successMessage = 'Personal information updated successfully'
        break
      case 'preferences':
        successMessage = 'Display preferences updated successfully'
        break
      case 'notifications':
        successMessage = 'Notification preferences updated successfully'
        break
      case 'security':
        successMessage = 'Security settings updated successfully'
        break
      default:
        successMessage = 'Profile updated successfully'
    }

    const result = await updateProfile(formData)
    if (result.success) {
      // Update local profile state if needed
      setProfile(prev => prev ? { ...prev, ...result.data } : null)
      // Update original form data to reflect saved state
      setOriginalFormData(JSON.parse(JSON.stringify(formData)))
      // Update DateTime context with new preferences
      setPreferences({
        dateFormat: formData.dateFormat as 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD',
        timeFormat: formData.timeFormat as '12h' | '24h',
        timezone: resolvedTimezone
      })
      // Show success toast notification
      showToast({
        type: 'success',
        title: 'Profile Updated',
        message: successMessage,
        duration: 4000
      })
      // Clear any previous error
      setAuthError('')
    }
  }

  const twoFactorDirty = twoFactorEnabled !== twoFactorInitial

  const handleTwoFactorSave = async () => {
    if (!twoFactorDirty || isSavingTwoFactor) return
    setIsSavingTwoFactor(true)
    try {
      const response = await fetch('/api/settings/security', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
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
      showToast({
        type: 'error',
        title: 'Update Failed',
        message: error.message || 'Could not update two-factor settings.',
        duration: 4000
      })
    } finally {
      setIsSavingTwoFactor(false)
    }
  }

  const handlePasswordChange = async () => {
    const result = await changePassword(passwordData)
    if (result.success) {
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
      // Reset password visibility states
      setShowPassword(false)
      setShowNewPassword(false)
      setShowConfirmPassword(false)
      showToast({
        type: 'success',
        title: 'Password Changed',
        message: 'Your password has been updated successfully. Please use your new password for future logins.',
        duration: 5000
      })
      setAuthError('')
    }
  }

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const result = await uploadAvatar(file)
      if (result.success) {
        // Update local profile state
        setProfile(prev => prev ? { ...prev, avatar: result.data?.avatar } : null)
        showToast({
          type: 'success',
          title: 'Avatar Updated',
          message: 'Your profile picture has been updated successfully',
          duration: 4000
        })
        setAuthError('')
      }
    }
  }

  const handleRemoveAvatar = async () => {
    if (!profile) return

    try {
      setRemovingAvatar(true)
      const response = await fetch('/api/profile/avatar', {
        method: 'DELETE'
      })

      const result = await response.json()

      if (result.success) {
        setProfile(prev => prev ? { ...prev, avatar: result.data?.avatar } : null)
        showToast({
          type: 'success',
          title: 'Avatar Removed',
          message: 'Your avatar has been removed.',
          duration: 4000
        })
        setAuthError('')
      } else {
        showToast({
          type: 'error',
          title: 'Error',
          message: result.error || 'Failed to remove avatar.',
          duration: 4000
        })
      }
    } catch (error) {
      console.error('Avatar removal error:', error)
      showToast({
        type: 'error',
        title: 'Error',
        message: 'Failed to remove avatar.',
        duration: 4000
      })
    } finally {
      setRemovingAvatar(false)
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading profile...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (authError) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-destructive mb-4">{authError}</p>
            <p className="text-muted-foreground">Redirecting to login...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (!profile) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-muted-foreground">No user data available</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  const handleNavigateToSecurity = (section: 'twoFactor' | 'sessions') => {
    if (section === 'twoFactor') {
      setIsTwoFactorModalOpen(false)
    } else {
      setIsSessionsModalOpen(false)
    }
    router.push(`/security?section=${section}`)
  }


  // Check if there are any changes in the current tab's form data
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
      case 'security':
        return false // Security tab doesn't have form data to save
      default:
        return false
    }
  }

  return (
    <MainLayout>
      <div className="space-y-10">
        {/* Profile Header */}
        <div className="border-b border-border pb-6">
          <div className="flex items-center space-x-4">
            <Button variant="outline" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="flex items-center space-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
                <p className="text-muted-foreground">
                  {organization ? `Manage your personal information and preferences for ${organization.name}` : 'Manage your personal information and preferences'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Profile Content */}
        <div className="space-y-8">
          {(profileError || authError) && (
            <Alert variant="destructive">
              <AlertDescription>{profileError || authError}</AlertDescription>
            </Alert>
          )}


          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="personal" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Personal Info
              </TabsTrigger>
              <TabsTrigger value="preferences" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Preferences
              </TabsTrigger>
              <TabsTrigger value="notifications" className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Notifications
              </TabsTrigger>
              <TabsTrigger value="security" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Security
              </TabsTrigger>
            </TabsList>

            {/* Personal Information Tab */}
            <TabsContent value="personal" className="space-y-8">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Personal Information
                  </CardTitle>
                  <CardDescription>
                    Update your personal details and contact information
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                  {/* Avatar Section */}
                  <div className="flex flex-col md:flex-row items-center md:items-start gap-6 p-6 rounded-lg border bg-muted/30">
                    <GravatarAvatar 
                      user={{
                        avatar: profile?.avatar,
                        firstName: profile?.firstName,
                        lastName: profile?.lastName,
                        email: profile?.email
                      }}
                      size={120}
                      className="h-32 w-32 ring-4 ring-background shadow-lg"
                    />
                    <div className="flex-1 space-y-3 text-center md:text-left">
                      <div>
                        <h3 className="text-lg font-semibold">{profile?.firstName} {profile?.lastName}</h3>
                        <p className="text-sm text-muted-foreground">{profile?.email}</p>
                      </div>
                      <input
                        type="file"
                        id="avatar-upload"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        onChange={handleAvatarUpload}
                        className="hidden"
                      />
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => document.getElementById('avatar-upload')?.click()}
                            disabled={profileLoading}
                          >
                            {profileLoading ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Uploading...
                              </>
                            ) : (
                              'Change Avatar'
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRemoveAvatar}
                            disabled={removingAvatar}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {removingAvatar ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Removing...
                              </>
                            ) : (
                              'Remove Avatar'
                            )}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          JPG, PNG, GIF or WebP. Max size 2MB.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Personal Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        value={formData.firstName}
                        onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                        placeholder="Enter your first name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        value={formData.lastName}
                        onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                        placeholder="Enter your last name"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profile?.email}
                      disabled
                      className="bg-muted/50 text-muted-foreground cursor-not-allowed"
                    />
                    <p className="text-sm text-muted-foreground">Email cannot be changed</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <Label>Timezone (auto-detected)</Label>
                      <Input
                        value={resolvedTimezone}
                        disabled
                        className="bg-muted/50 text-muted-foreground cursor-not-allowed"
                      />
                      <p className="text-sm text-muted-foreground">
                        Timezone follows your device settings.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="language">Language</Label>
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
                    {/* <div className="space-y-2">
                      <Label htmlFor="currency">Currency</Label>
                      <Select value={formData.currency} onValueChange={(value) => setFormData(prev => ({ ...prev, currency: value }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {currenciesLoading ? (
                            <SelectItem value="loading" disabled>Loading currencies...</SelectItem>
                          ) : (
                            currencies.map((currency, index) => (
                              <SelectItem key={`${currency.code}-${index}`} value={currency.code}>
                                {formatCurrencyDisplay(currency)}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div> */}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Preferences Tab */}
            <TabsContent value="preferences" className="space-y-8">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Palette className="h-5 w-5" />
                    Display Preferences
                  </CardTitle>
                  <CardDescription>
                    Customize how the application looks and behaves
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="theme" className="text-sm font-medium">Theme</Label>
                      <Select value={formData.theme} onValueChange={(value: 'light' | 'dark' | 'system') => setFormData(prev => ({ ...prev, theme: value }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light">☀️ Light</SelectItem>
                          <SelectItem value="dark">🌙 Dark</SelectItem>
                          <SelectItem value="system">💻 System</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="dateFormat" className="text-sm font-medium">Date Format</Label>
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

                    <div className="space-y-2">
                      <Label htmlFor="timeFormat" className="text-sm font-medium">Time Format</Label>
                      <Select value={formData.timeFormat} onValueChange={(value: '12h' | '24h') => setFormData(prev => ({ ...prev, timeFormat: value }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="12h">🕐 12-hour (AM/PM)</SelectItem>
                          <SelectItem value="24h">🕐 24-hour</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                    <div className="space-y-1">
                      <Label htmlFor="sidebarCollapsed" className="text-sm font-medium">Collapsed Sidebar</Label>
                      <p className="text-sm text-muted-foreground">
                        Start with the sidebar collapsed by default
                      </p>
                    </div>
                    <Switch
                      id="sidebarCollapsed"
                      checked={formData.sidebarCollapsed}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, sidebarCollapsed: checked }))}
                    />
                  </div>

                  <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      <strong>Note:</strong> When you change date/time formats above, all dates and times throughout the application will update immediately to reflect your preferences. Time input fields will also accept input in your selected format (e.g., "2:30 PM" for 12-hour or "14:30" for 24-hour).
                    </p>
                  </div>
                </CardContent>
              </Card>

            </TabsContent>

            {/* Notifications Tab */}
            <TabsContent value="notifications" className="space-y-8">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Notification Preferences
                  </CardTitle>
                  <CardDescription>
                    Choose how you want to be notified about updates and activities
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-semibold mb-4 text-foreground">Notification Channels</h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                          <div className="space-y-1">
                            <Label className="flex items-center gap-2 text-sm font-medium">
                              <Mail className="h-4 w-4" />
                              Email Notifications
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              Receive notifications via email
                            </p>
                          </div>
                          <Switch
                            checked={formData.notifications.email}
                            onCheckedChange={(checked) => setFormData(prev => ({ 
                              ...prev, 
                              notifications: { ...prev.notifications, email: checked }
                            }))}
                          />
                        </div>

                        <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                          <div className="space-y-1">
                            <Label className="flex items-center gap-2 text-sm font-medium">
                              <Monitor className="h-4 w-4" />
                              In-App Notifications
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              Show notifications within the application
                            </p>
                          </div>
                          <Switch
                            checked={formData.notifications.inApp}
                            onCheckedChange={(checked) => setFormData(prev => ({ 
                              ...prev, 
                              notifications: { ...prev.notifications, inApp: checked }
                            }))}
                          />
                        </div>

                        <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                          <div className="space-y-1">
                            <Label className="flex items-center gap-2 text-sm font-medium">
                              <Smartphone className="h-4 w-4" />
                              Push Notifications
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              Receive push notifications in your browser
                            </p>
                          </div>
                          <Switch
                            checked={formData.notifications.push}
                            onCheckedChange={(checked) => setFormData(prev => ({ 
                              ...prev, 
                              notifications: { ...prev.notifications, push: checked }
                            }))}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-6">
                      <h3 className="text-sm font-semibold mb-4 text-foreground">Activity Preferences</h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                          <div className="space-y-1">
                            <Label className="flex items-center gap-2 text-sm font-medium">
                              <Clock className="h-4 w-4" />
                              Task Reminders
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              Get reminded about upcoming task deadlines
                            </p>
                          </div>
                          <Switch
                            checked={formData.notifications.taskReminders}
                            onCheckedChange={(checked) => setFormData(prev => ({ 
                              ...prev, 
                              notifications: { ...prev.notifications, taskReminders: checked }
                            }))}
                          />
                        </div>

                        <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                          <div className="space-y-1">
                            <Label className="flex items-center gap-2 text-sm font-medium">
                              <Globe className="h-4 w-4" />
                              Project Updates
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              Get notified about project status changes
                            </p>
                          </div>
                          <Switch
                            checked={formData.notifications.projectUpdates}
                            onCheckedChange={(checked) => setFormData(prev => ({ 
                              ...prev, 
                              notifications: { ...prev.notifications, projectUpdates: checked }
                            }))}
                          />
                        </div>

                        <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                          <div className="space-y-1">
                            <Label className="flex items-center gap-2 text-sm font-medium">
                              <User className="h-4 w-4" />
                              Team Activity
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              Get notified about team member activities
                            </p>
                          </div>
                          <Switch
                            checked={formData.notifications.teamActivity}
                            onCheckedChange={(checked) => setFormData(prev => ({ 
                              ...prev, 
                              notifications: { ...prev.notifications, teamActivity: checked }
                            }))}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Security Tab */}
            <TabsContent value="security" className="space-y-8">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Security Settings
                  </CardTitle>
                  <CardDescription>
                    Manage your account security and authentication
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Password Change Section */}
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-base font-semibold">
                        <Key className="h-5 w-5" />
                        Change Password
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Update your password to keep your account secure. Use a strong password with at least 8 characters.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="currentPassword">Current Password</Label>
                        <div className="relative">
                          <Input
                            id="currentPassword"
                            type={showPassword ? "text" : "password"}
                            value={passwordData.currentPassword}
                            onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                            placeholder="Enter current password"
                            className="pr-10"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="newPassword">New Password</Label>
                          <div className="relative">
                            <Input
                              id="newPassword"
                              type={showNewPassword ? "text" : "password"}
                              value={passwordData.newPassword}
                              onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                              placeholder="Enter new password"
                              className="pr-10"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                              onClick={() => setShowNewPassword(!showNewPassword)}
                            >
                              {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="confirmPassword">Confirm New Password</Label>
                          <div className="relative">
                            <Input
                              id="confirmPassword"
                              type={showConfirmPassword ? "text" : "password"}
                              value={passwordData.confirmPassword}
                              onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                              placeholder="Confirm new password"
                              className="pr-10"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            >
                              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button onClick={handlePasswordChange} disabled={profileLoading} variant="default">
                        {profileLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Changing Password...
                          </>
                        ) : (
                          <>
                            <Key className="mr-2 h-4 w-4" />
                            Change Password
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="border-t pt-8">
                    <div className="space-y-6">
                      <div>
                        <Label className="flex items-center gap-2 text-base font-semibold mb-3">
                          <Shield className="h-5 w-5" />
                          Two-Factor Authentication
                        </Label>
                        <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30 my-4">
                          <div className="space-y-1">
                            <p className="text-sm font-medium">Enable 2FA Protection</p>
                            <p className="text-sm text-muted-foreground">
                              Add an extra layer of security to your account with two-factor authentication
                            </p>
                          </div>
                          <Switch
                            checked={twoFactorEnabled}
                            onCheckedChange={setTwoFactorEnabled}
                            aria-label="Toggle two-factor authentication"
                          />
                        </div>
                      </div>

                      <div>
                        <Label className="flex items-center gap-2 text-base font-semibold mb-3">
                          <Monitor className="h-5 w-5" />
                          Active Sessions
                        </Label>
                        <div className="p-4 rounded-lg border bg-muted/30 my-4">
                          <p className="text-sm text-muted-foreground">
                            Monitor and manage devices that are currently signed in to your account. Review your active sessions to ensure account security.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap justify-end gap-3 pt-2">
                        <Button
                          variant="outline"
                          onClick={() => setIsTwoFactorModalOpen(true)}
                          title="Review and configure two-factor authentication"
                          disabled={!twoFactorDirty}
                        >
                          Manage 2FA
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setIsSessionsModalOpen(true)}
                          title="View the devices that are signed in"
                          disabled={!twoFactorDirty}
                        >
                          View Sessions
                        </Button>
                        <Button
                          onClick={handleTwoFactorSave}
                          disabled={!twoFactorDirty || isSavingTwoFactor}
                        >
                          {isSavingTwoFactor ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            'Save 2FA Settings'
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Save Changes Button - Only show for non-security tabs */}
          {activeTab !== 'security' && (
            <div className="flex items-center justify-end p-4 border-t bg-background">
              <Button 
                onClick={handleSave} 
                disabled={profileLoading || !hasChanges()}
                size="lg"
              >
                {profileLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving Changes...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          )}

        </div>
      </div>

      <Dialog open={isTwoFactorModalOpen} onOpenChange={setIsTwoFactorModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              Protect your account by requiring a one-time code when you sign in.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="rounded-lg border p-4 bg-muted/40">
              <p className="text-sm font-medium text-foreground">
                Current status:{' '}
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${twoFactorEnabled ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'}`}>
                  {twoFactorEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                We remember this preference from your last security check. Manage authenticators and backup codes from the Security Center.
              </p>
            </div>
            <div className="space-y-2 text-sm">
              <p className="font-medium text-foreground">Getting started</p>
              <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                <li>Open the Security Center from the button below.</li>
                <li>Toggle two-factor authentication on and scan the QR code with your authenticator app.</li>
                <li>Enter the generated code to confirm and download your backup codes.</li>
              </ol>
            </div>
            <Alert>
              <AlertDescription>
                Tip: We recommend Google Authenticator, 1Password, or Microsoft Authenticator for generating secure codes.
              </AlertDescription>
            </Alert>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTwoFactorModalOpen(false)}>
              Close
            </Button>
            <Button onClick={() => handleNavigateToSecurity('twoFactor')}>
              Open Security Center
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <div className="text-sm text-muted-foreground">
                No sessions detected for your account.
              </div>
            ) : (
              sessionInsights.map((session) => (
                <div key={session.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">{session.label}</p>
                      <p className="text-xs text-muted-foreground break-words">{session.device}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${session.isCurrent ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'bg-secondary text-secondary-foreground'}`}>
                      {session.isCurrent ? 'Current device' : 'Signed in'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Last active: {formatDateDisplay(session.lastActive)} at {formatTimeDisplay(session.lastActive)} ({session.location || 'Timezone unknown'})
                  </p>
                </div>
              ))
            )}
            <Alert>
              <AlertDescription>
                Need to sign out another device? Jump into the Security Center to revoke access instantly.
              </AlertDescription>
            </Alert>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSessionsModalOpen(false)}>
              Close
            </Button>
            <Button onClick={() => handleNavigateToSecurity('sessions')}>
              Open Security Center
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  )
}