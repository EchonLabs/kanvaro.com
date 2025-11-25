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
import { useOrganization } from '@/hooks/useOrganization'
import { useCurrencies } from '@/hooks/useCurrencies'
import { useProfile } from '@/hooks/useProfile'
import { 
  User, 
  Settings, 
  Bell, 
  Shield, 
  Save,
  Loader2,
  CheckCircle,
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
}

export default function ProfilePage() {
  const router = useRouter()
  const { organization, loading: orgLoading } = useOrganization()
  const { currencies, loading: currenciesLoading, formatCurrencyDisplay } = useCurrencies(true)
  const { updateProfile, changePassword, uploadAvatar, loading: profileLoading, error: profileError, success: profileSuccess } = useProfile()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    timezone: 'UTC',
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

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      
      if (response.ok) {
        const userData = await response.json()
        setProfile(userData)
        setFormData({
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          timezone: userData.timezone || 'UTC',
          language: userData.language || 'en',
          currency: userData.currency || 'USD',
          theme: userData.preferences?.theme || 'system',
          sidebarCollapsed: userData.preferences?.sidebarCollapsed || false,
          dateFormat: userData.preferences?.dateFormat || 'MM/DD/YYYY',
          timeFormat: userData.preferences?.timeFormat || '12h',
          notifications: {
            email: userData.preferences?.notifications?.email ?? true,
            inApp: userData.preferences?.notifications?.inApp ?? true,
            push: userData.preferences?.notifications?.push ?? false,
            taskReminders: userData.preferences?.notifications?.taskReminders ?? true,
            projectUpdates: userData.preferences?.notifications?.projectUpdates ?? true,
            teamActivity: userData.preferences?.notifications?.teamActivity ?? false
          }
        })
        setAuthError('')
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json()
          setProfile(refreshData)
          setFormData({
            firstName: refreshData.firstName || '',
            lastName: refreshData.lastName || '',
            timezone: refreshData.timezone || 'UTC',
            language: refreshData.language || 'en',
            currency: refreshData.currency || 'USD',
            theme: refreshData.preferences?.theme || 'system',
            sidebarCollapsed: refreshData.preferences?.sidebarCollapsed || false,
            dateFormat: refreshData.preferences?.dateFormat || 'MM/DD/YYYY',
            timeFormat: refreshData.preferences?.timeFormat || '12h',
            notifications: {
              email: refreshData.preferences?.notifications?.email ?? true,
              inApp: refreshData.preferences?.notifications?.inApp ?? true,
              push: refreshData.preferences?.notifications?.push ?? false,
              taskReminders: refreshData.preferences?.notifications?.taskReminders ?? true,
              projectUpdates: refreshData.preferences?.notifications?.projectUpdates ?? true,
              teamActivity: refreshData.preferences?.notifications?.teamActivity ?? false
            }
          })
          setAuthError('')
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
  }, [router])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const handleSave = async () => {
    const result = await updateProfile(formData)
    if (result.success) {
      // Update local profile state if needed
      setProfile(prev => prev ? { ...prev, ...result.data } : null)
    }
  }

  const handlePasswordChange = async () => {
    const result = await changePassword(passwordData)
    if (result.success) {
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
    }
  }

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const result = await uploadAvatar(file)
      if (result.success) {
        // Update local profile state
        setProfile(prev => prev ? { ...prev, avatar: result.data?.avatar } : null)
      }
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

  return (
    <MainLayout>
      <div className="space-y-8">
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
        <div className="space-y-6">
          {profileError && (
            <Alert variant="destructive">
              <AlertDescription>{profileError}</AlertDescription>
            </Alert>
          )}

          {profileSuccess && (
            <Alert variant="default">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>{profileSuccess}</AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="personal" className="space-y-6">
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
            <TabsContent value="personal" className="space-y-6">
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
                <CardContent className="space-y-6">
                  {/* Avatar Section */}
                  <div className="flex items-center space-x-6">
                    <GravatarAvatar 
                      user={{
                        avatar: profile?.avatar,
                        firstName: profile?.firstName,
                        lastName: profile?.lastName,
                        email: profile?.email
                      }}
                      size={120}
                      className="h-32 w-32"
                    />
                    <div className="space-y-2">
                      <input
                        type="file"
                        id="avatar-upload"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        onChange={handleAvatarUpload}
                        className="hidden"
                      />
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
                      <p className="text-sm text-muted-foreground">
                        JPG, PNG, GIF or WebP. Max size 2MB.
                      </p>
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
                      <Label htmlFor="timezone">Timezone</Label>
                      <Select value={formData.timezone} onValueChange={(value) => setFormData(prev => ({ ...prev, timezone: value }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="UTC">UTC</SelectItem>
                          <SelectItem value="America/New_York">Eastern Time</SelectItem>
                          <SelectItem value="America/Chicago">Central Time</SelectItem>
                          <SelectItem value="America/Denver">Mountain Time</SelectItem>
                          <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                          <SelectItem value="Europe/London">London</SelectItem>
                          <SelectItem value="Europe/Paris">Paris</SelectItem>
                          <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                        </SelectContent>
                      </Select>
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
                    <div className="space-y-2">
                      <Label htmlFor="currency">Currency</Label>
                      <Select value={formData.currency} onValueChange={(value) => setFormData(prev => ({ ...prev, currency: value }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {currenciesLoading ? (
                            <SelectItem value="loading" disabled>Loading currencies...</SelectItem>
                          ) : (
                            currencies.map((currency) => (
                              <SelectItem key={currency.code} value={currency.code}>
                                {formatCurrencyDisplay(currency)}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Preferences Tab */}
            <TabsContent value="preferences" className="space-y-6">
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
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="theme">Theme</Label>
                      <Select value={formData.theme} onValueChange={(value: 'light' | 'dark' | 'system') => setFormData(prev => ({ ...prev, theme: value }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light">Light</SelectItem>
                          <SelectItem value="dark">Dark</SelectItem>
                          <SelectItem value="system">System</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="dateFormat">Date Format</Label>
                      <Select value={formData.dateFormat} onValueChange={(value) => setFormData(prev => ({ ...prev, dateFormat: value }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                          <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                          <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="timeFormat">Time Format</Label>
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

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="sidebarCollapsed">Collapsed Sidebar</Label>
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
                </CardContent>
              </Card>
            </TabsContent>

            {/* Notifications Tab */}
            <TabsContent value="notifications" className="space-y-6">
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
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="flex items-center gap-2">
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

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="flex items-center gap-2">
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

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="flex items-center gap-2">
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


                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="flex items-center gap-2">
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

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="flex items-center gap-2">
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

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="flex items-center gap-2">
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
                </CardContent>
              </Card>
            </TabsContent>

            {/* Security Tab */}
            <TabsContent value="security" className="space-y-6">
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
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Key className="h-4 w-4" />
                        Change Password
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Update your password to keep your account secure
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="currentPassword">Current Password</Label>
                        <div className="relative">
                          <Input
                            id="currentPassword"
                            type={showPassword ? "text" : "password"}
                            value={passwordData.currentPassword}
                            onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                            placeholder="Enter current password"
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

                      <div className="space-y-2">
                        <Label htmlFor="newPassword">New Password</Label>
                        <Input
                          id="newPassword"
                          type={showPassword ? "text" : "password"}
                          value={passwordData.newPassword}
                          onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                          placeholder="Enter new password"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirm New Password</Label>
                        <Input
                          id="confirmPassword"
                          type={showPassword ? "text" : "password"}
                          value={passwordData.confirmPassword}
                          onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                          placeholder="Confirm new password"
                        />
                      </div>
                    </div>

                    <Button onClick={handlePasswordChange} disabled={profileLoading} variant="outline">
                      {profileLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Changing...
                        </>
                      ) : (
                        <>
                          <Key className="mr-2 h-4 w-4" />
                          Change Password
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="border-t pt-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Two-Factor Authentication</Label>
                          <p className="text-sm text-muted-foreground">
                            Add an extra layer of security to your account
                          </p>
                        </div>
                        <Button variant="outline" size="sm">
                          Enable 2FA
                        </Button>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Active Sessions</Label>
                          <p className="text-sm text-muted-foreground">
                            Manage your active login sessions
                          </p>
                        </div>
                        <Button variant="outline" size="sm">
                          View Sessions
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Save Button */}
          <div className="flex justify-end pt-6 mt-8 border-t border-muted">
            <Button onClick={handleSave} disabled={profileLoading} size="lg">
              {profileLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}