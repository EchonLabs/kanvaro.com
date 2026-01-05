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
import { Settings, Save, Loader2, AlertCircle, CheckCircle, Bell, Palette, Globe } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useCurrencies } from '@/hooks/useCurrencies'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { DateTimePreferences } from '@/lib/dateTimeUtils'
import { NotificationTest } from '@/components/notifications/NotificationTest'

export default function PreferencesPage() {
  const { currencies, loading: currenciesLoading, formatCurrencyDisplay } = useCurrencies(true)
  const { isSupported, isSubscribed, permission, isLoading: pushLoading, toggleSubscription, showTestNotification } = usePushNotifications()
  const { setPreferences: setDateTimePreferences } = useDateTime()
  const [isLoading, setIsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [authError, setAuthError] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const router = useRouter()

  const [formData, setFormData] = useState({
    theme: 'system',
    language: 'en',
    timezone: 'UTC',
    currency: 'USD',
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    notifications: {
      email: true,
      push: true,
      taskReminders: true,
      projectUpdates: true,
      teamActivity: false
    }
  })

  const checkAuth = useCallback(async () => {
    try {
      console.log('Preferences: Checking authentication...')
      const response = await fetch('/api/auth/me')
      console.log('Preferences: Auth response status:', response.status)
      
      if (response.ok) {
        const userData = await response.json()
        console.log('Preferences: User data received:', userData)
        setUser(userData)
        setFormData({
          theme: userData.preferences?.theme || 'system',
          language: userData.language || 'en',
          timezone: userData.timezone || 'UTC',
          currency: userData.currency || 'USD',
          dateFormat: userData.preferences?.dateFormat || 'MM/DD/YYYY',
          timeFormat: userData.preferences?.timeFormat || '12h',
          notifications: {
            email: userData.preferences?.notifications?.email ?? true,
            push: userData.preferences?.notifications?.push ?? true,
            taskReminders: userData.preferences?.notifications?.taskReminders ?? true,
            projectUpdates: userData.preferences?.notifications?.projectUpdates ?? true,
            teamActivity: userData.preferences?.notifications?.teamActivity ?? false
          }
        })

        // Sync DateTimeProvider with user preferences
        const loadedPreferences = {
          dateFormat: userData.preferences?.dateFormat || 'MM/DD/YYYY',
          timeFormat: userData.preferences?.timeFormat || '12h',
          timezone: userData.timezone || 'UTC'
        }
        setDateTimePreferences(loadedPreferences)

        // Store in sessionStorage
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('user_date_preferences', JSON.stringify(loadedPreferences))
        }

        setAuthError('')
      } else if (response.status === 401) {
        console.log('Preferences: 401 response, trying refresh token')
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json()
          setUser(refreshData.user)
          setFormData({
            theme: refreshData.user.preferences?.theme || 'system',
            language: refreshData.user.language || 'en',
            timezone: refreshData.user.timezone || 'UTC',
            currency: refreshData.user.currency || 'USD',
            dateFormat: refreshData.user.preferences?.dateFormat || 'MM/DD/YYYY',
            timeFormat: refreshData.user.preferences?.timeFormat || '12h',
            notifications: {
              email: refreshData.user.preferences?.notifications?.email ?? true,
              push: refreshData.user.preferences?.notifications?.push ?? true,
              taskReminders: refreshData.user.preferences?.notifications?.taskReminders ?? true,
              projectUpdates: refreshData.user.preferences?.notifications?.projectUpdates ?? true,
              teamActivity: refreshData.user.preferences?.notifications?.teamActivity ?? false
            }
          })

          // Sync DateTimeProvider with refreshed user preferences
          const refreshedPreferences = {
            dateFormat: refreshData.user.preferences?.dateFormat || 'MM/DD/YYYY',
            timeFormat: refreshData.user.preferences?.timeFormat || '12h',
            timezone: refreshData.user.timezone || 'UTC'
          }
          setDateTimePreferences(refreshedPreferences)

          // Store in sessionStorage
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('user_date_preferences', JSON.stringify(refreshedPreferences))
          }

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
      setIsLoading(false)
    }
  }, [router])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const response = await fetch('/api/settings/user', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          theme: formData.theme,
          dateFormat: formData.dateFormat,
          timeFormat: formData.timeFormat,
          notifications: formData.notifications
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update preferences')
      }

      // Update DateTimeProvider with new preferences
      const newPreferences = {
        dateFormat: formData.dateFormat as 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD',
        timeFormat: formData.timeFormat as '12h' | '24h',
        timezone: formData.timezone || 'UTC'
      }
      setDateTimePreferences(newPreferences)

      // Store in sessionStorage for persistence
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('user_date_preferences', JSON.stringify(newPreferences))
      }

      setMessage({ type: 'success', text: 'Preferences updated successfully' })
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update preferences' })
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading preferences...</p>
        </div>
      </div>
    )
  }

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-destructive mb-4">{authError}</p>
          <p className="text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">No user data available</p>
        </div>
      </div>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Preferences Header */}
        <div className="border-b border-border pb-6">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Settings className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Preferences</h1>
              <p className="text-muted-foreground">
                Customize your application experience and notification settings.
              </p>
            </div>
          </div>
        </div>

        {/* Preferences Content */}
        <div className="space-y-6">
          {/* Appearance & Language */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Appearance & Language
              </CardTitle>
              <CardDescription>
                Customize the look and feel of your application.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="theme">Theme</Label>
                  <Select value={formData.theme} onValueChange={(value) => setFormData({ ...formData, theme: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select theme" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="language">Language</Label>
                  <Select value={formData.language} onValueChange={(value) => setFormData({ ...formData, language: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="de">German</SelectItem>
                      <SelectItem value="it">Italian</SelectItem>
                      <SelectItem value="pt">Portuguese</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="timezone">Timezone</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        try {
                          const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
                          setFormData({ ...formData, timezone: userTimezone })
                        } catch (error) {
                          console.error('Failed to detect timezone:', error)
                        }
                      }}
                      className="text-xs"
                    >
                      Detect Timezone
                    </Button>
                  </div>
                  <Select value={formData.timezone} onValueChange={(value) => setFormData({ ...formData, timezone: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select timezone" />
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
                      <SelectItem value="Asia/Colombo">Sri Lanka Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select value={formData.currency} onValueChange={(value) => setFormData({ ...formData, currency: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select currency" />
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
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dateFormat">Date Format</Label>
                  <Select value={formData.dateFormat} onValueChange={(value) => setFormData({ ...formData, dateFormat: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select date format" />
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
                  <Select value={formData.timeFormat} onValueChange={(value) => setFormData({ ...formData, timeFormat: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select time format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="12h">12-hour (AM/PM)</SelectItem>
                      <SelectItem value="24h">24-hour</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications
              </CardTitle>
              <CardDescription>
                Choose how you want to be notified about updates and activities.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive notifications via email
                    </p>
                  </div>
                  <Switch
                    checked={formData.notifications.email}
                    onCheckedChange={(checked) => setFormData({
                      ...formData,
                      notifications: { ...formData.notifications, email: checked }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Push Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive push notifications in your browser
                    </p>
                    {!isSupported && (
                      <p className="text-xs text-destructive">
                        Push notifications are not supported in this browser
                      </p>
                    )}
                    {permission === 'denied' && (
                      <p className="text-xs text-destructive">
                        Notification permission denied. Please enable in browser settings.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={isSubscribed}
                      onCheckedChange={toggleSubscription}
                      disabled={!isSupported || permission === 'denied' || isLoading}
                    />
                    {isSubscribed && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={showTestNotification}
                        disabled={isLoading}
                      >
                        Test
                      </Button>
                    )}
                  </div>
                </div>


                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Task Reminders</Label>
                    <p className="text-sm text-muted-foreground">
                      Get reminded about upcoming task deadlines
                    </p>
                  </div>
                  <Switch
                    checked={formData.notifications.taskReminders}
                    onCheckedChange={(checked) => setFormData({
                      ...formData,
                      notifications: { ...formData.notifications, taskReminders: checked }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Project Updates</Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified about project status changes
                    </p>
                  </div>
                  <Switch
                    checked={formData.notifications.projectUpdates}
                    onCheckedChange={(checked) => setFormData({
                      ...formData,
                      notifications: { ...formData.notifications, projectUpdates: checked }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Team Activity</Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified about team member activities
                    </p>
                  </div>
                  <Switch
                    checked={formData.notifications.teamActivity}
                    onCheckedChange={(checked) => setFormData({
                      ...formData,
                      notifications: { ...formData.notifications, teamActivity: checked }
                    })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {message && (
            <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
              {message.type === 'error' ? <AlertCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}

          {/* Notification Test Component */}
          <NotificationTest />

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="flex items-center gap-2">
              {saving ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? 'Saving...' : 'Save Preferences'}
            </Button>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
