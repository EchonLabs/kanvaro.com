'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Shield, Save, Loader2, Key, Smartphone, ShieldCheck, Eye, EyeOff } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PasswordStrength } from '@/components/ui/PasswordStrength'
import { useToast } from '@/components/ui/Toast'

type SecuritySettingsState = {
  twoFactorEnabled: boolean
  loginAlerts: boolean
  sessionTimeout: number
  requirePasswordChange: boolean
}

const DEFAULT_SECURITY_SETTINGS: SecuritySettingsState = {
  twoFactorEnabled: false,
  loginAlerts: true,
  sessionTimeout: 30,
  requirePasswordChange: false
}

const normalizeSecurityPayload = (
  payload?: Partial<Record<keyof SecuritySettingsState, any>>
): SecuritySettingsState => {
  const parsedTimeout = Number(payload?.sessionTimeout)
  const normalizedTimeout = Number.isNaN(parsedTimeout)
    ? DEFAULT_SECURITY_SETTINGS.sessionTimeout
    : Math.min(Math.max(Math.round(parsedTimeout), 5), 1440)

  return {
    twoFactorEnabled:
      typeof payload?.twoFactorEnabled === 'boolean'
        ? payload.twoFactorEnabled
        : DEFAULT_SECURITY_SETTINGS.twoFactorEnabled,
    loginAlerts:
      typeof payload?.loginAlerts === 'boolean'
        ? payload.loginAlerts
        : DEFAULT_SECURITY_SETTINGS.loginAlerts,
    sessionTimeout: normalizedTimeout,
    requirePasswordChange:
      typeof payload?.requirePasswordChange === 'boolean'
        ? payload.requirePasswordChange
        : DEFAULT_SECURITY_SETTINGS.requirePasswordChange
  }
}

export default function SecurityPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [isSavingSecurity, setIsSavingSecurity] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [authError, setAuthError] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const router = useRouter()
  const { showToast } = useToast()

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [securitySettings, setSecuritySettings] = useState<SecuritySettingsState>({
    ...DEFAULT_SECURITY_SETTINGS
  })
  const [initialSecuritySettings, setInitialSecuritySettings] = useState<SecuritySettingsState>({
    ...DEFAULT_SECURITY_SETTINGS
  })
  const [isSavingTwoFactor, setIsSavingTwoFactor] = useState(false)

  const loadSecuritySettings = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/security')
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        if (response.status === 404) {
          setSecuritySettings({ ...DEFAULT_SECURITY_SETTINGS })
          return
        }

        const errorMessage = data?.error || 'Failed to load security settings'
        throw new Error(errorMessage)
      }

      const payload = data?.data ?? data ?? {}
      const normalizedSettings = normalizeSecurityPayload(payload)
      setSecuritySettings(normalizedSettings)
      setInitialSecuritySettings(normalizedSettings)
    } catch (error) {
      console.error('Load security settings failed:', error)
      showToast({
        type: 'error',
        title: 'Unable to load security settings',
        message: 'Please try again.',
        duration: 4000
      })
      setSecuritySettings({ ...DEFAULT_SECURITY_SETTINGS })
      setInitialSecuritySettings({ ...DEFAULT_SECURITY_SETTINGS })
    }
  }, [showToast])

  const checkAuth = useCallback(async () => {
    try {
      console.log('Security: Checking authentication...')
      const response = await fetch('/api/auth/me')
      console.log('Security: Auth response status:', response.status)
      
      if (response.ok) {
        const userData = await response.json()
        console.log('Security: User data received:', userData)
        setUser(userData)
        await loadSecuritySettings()
        setAuthError('')
      } else if (response.status === 401) {
        console.log('Security: 401 response, trying refresh token')
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json()
          setUser(refreshData.user)
          await loadSecuritySettings()
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
  }, [loadSecuritySettings, router])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const passwordDirty =
    passwordForm.newPassword.trim() !== '' || passwordForm.confirmPassword.trim() !== ''

  const handlePasswordChange = async () => {
    if (!passwordDirty || isSavingPassword) {
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' })
      return
    }

    if (passwordForm.newPassword.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters long' })
      return
    }

    // Enhanced password validation
    const hasLowercase = /[a-z]/.test(passwordForm.newPassword)
    const hasUppercase = /[A-Z]/.test(passwordForm.newPassword)
    const hasNumber = /\d/.test(passwordForm.newPassword)
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(passwordForm.newPassword)

    if (!hasLowercase || !hasUppercase || !hasNumber || !hasSpecialChar) {
      setMessage({ type: 'error', text: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character' })
      return
    }

    setIsSavingPassword(true)
    setMessage(null)

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to change password')
      }

      setMessage({ type: 'success', text: 'Password changed successfully' })
      showToast({
        type: 'success',
        title: 'Password Updated',
        message: 'Your password has been changed successfully. Use your new password for future logins.',
        duration: 5000
      })
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      // Reset visibility toggles
      setShowCurrentPassword(false)
      setShowNewPassword(false)
      setShowConfirmPassword(false)
    } catch (error: any) {
      const errorText = error.message || 'Failed to change password'
      setMessage({ type: 'error', text: errorText })
      showToast({
        type: 'error',
        title: 'Password Change Failed',
        message: errorText,
        duration: 4000
      })
    } finally {
      setIsSavingPassword(false)
    }
  }

  const twoFactorDirty = securitySettings.twoFactorEnabled !== initialSecuritySettings.twoFactorEnabled
  const securitySettingsDirty =
    securitySettings.loginAlerts !== initialSecuritySettings.loginAlerts ||
    securitySettings.requirePasswordChange !== initialSecuritySettings.requirePasswordChange ||
    securitySettings.sessionTimeout !== initialSecuritySettings.sessionTimeout

  const handleSecuritySettingsSave = async () => {
    if (!securitySettingsDirty || isSavingSecurity) {
      return
    }

    setIsSavingSecurity(true)
    setMessage(null)

    try {
      const response = await fetch('/api/settings/security', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(securitySettings),
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        const errorMessage = data?.error || 'Failed to update security settings'
        throw new Error(errorMessage)
      }

      const updatedSettings = normalizeSecurityPayload(data?.data ?? securitySettings)
      setSecuritySettings(updatedSettings)
      setInitialSecuritySettings(updatedSettings)

      setMessage({ type: 'success', text: 'Security settings updated successfully' })
      showToast({
        type: 'success',
        title: 'Security Updated',
        message: 'Your security preferences have been saved.',
        duration: 4000
      })
    } catch (error) {
      const errorText = error instanceof Error ? error.message : 'Failed to update security settings'
      setMessage({ type: 'error', text: errorText })
      showToast({
        type: 'error',
        title: 'Save Failed',
        message: errorText,
        duration: 4000
      })
    } finally {
      setIsSavingSecurity(false)
    }
  }

  const handleTwoFactorSave = async () => {
    if (!twoFactorDirty || isSavingTwoFactor) {
      return
    }

    setIsSavingTwoFactor(true)
    setMessage(null)

    try {
      const response = await fetch('/api/settings/security', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ twoFactorEnabled: securitySettings.twoFactorEnabled })
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        const errorMessage = data?.error || 'Failed to update two-factor settings'
        throw new Error(errorMessage)
      }

      const updatedSettings = normalizeSecurityPayload(data?.data ?? securitySettings)
      setSecuritySettings((prev) => ({
        ...prev,
        twoFactorEnabled: updatedSettings.twoFactorEnabled
      }))
      setInitialSecuritySettings((prev) => ({
        ...prev,
        twoFactorEnabled: updatedSettings.twoFactorEnabled
      }))

      setMessage({ type: 'success', text: 'Two-factor authentication updated successfully' })
      showToast({
        type: 'success',
        title: '2FA Updated',
        message: updatedSettings.twoFactorEnabled
          ? 'Two-factor authentication is now enabled.'
          : 'Two-factor authentication has been disabled.',
        duration: 4000
      })
    } catch (error) {
      const errorText = error instanceof Error ? error.message : 'Failed to update two-factor settings'
      setMessage({ type: 'error', text: errorText })
      showToast({
        type: 'error',
        title: '2FA Update Failed',
        message: errorText,
        duration: 4000
      })
    } finally {
      setIsSavingTwoFactor(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading security settings...</p>
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
        {/* Security Header */}
        <div className="border-b border-border pb-6">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Security</h1>
              <p className="text-muted-foreground">
                Manage your account security settings and password.
              </p>
            </div>
          </div>
        </div>

        {/* Security Content */}
        <div className="space-y-8">
          {/* Change Password */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Change Password
              </CardTitle>
              <CardDescription>
                Update your password to keep your account secure.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showCurrentPassword ? "text" : "password"}
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                      placeholder="Enter your current password"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                      placeholder="Enter your new password"
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
                  <PasswordStrength password={passwordForm.newPassword} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                      placeholder="Confirm your new password"
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

              <div className="flex justify-end">
                <Button
                  onClick={handlePasswordChange}
                  disabled={!passwordDirty || isSavingPassword}
                  className="flex items-center gap-2"
                >
                  {isSavingPassword ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <Key className="h-4 w-4" />
                  )}
                  {isSavingPassword ? 'Changing...' : 'Change Password'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Two-Factor Authentication */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Two-Factor Authentication
              </CardTitle>
              <CardDescription>
                Add an extra layer of security to your account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable 2FA</Label>
                  <p className="text-sm text-muted-foreground">
                    Use an authenticator app to generate verification codes
                  </p>
                </div>
                <Switch
                  checked={securitySettings.twoFactorEnabled}
                  onCheckedChange={(checked) => setSecuritySettings({
                    ...securitySettings,
                    twoFactorEnabled: checked
                  })}
                />
              </div>

              {securitySettings.twoFactorEnabled && (
                <Alert>
                  <ShieldCheck className="h-4 w-4" />
                  <AlertDescription>
                    Two-factor authentication is enabled. You'll need to enter a verification code when signing in.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end pt-2 mt-4">
                <Button
                  onClick={handleTwoFactorSave}
                  disabled={!twoFactorDirty || isSavingTwoFactor}
                  className="flex items-center gap-2"
                  size="sm"
                >
                  {isSavingTwoFactor ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {isSavingTwoFactor ? 'Saving...' : 'Save 2FA Settings'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Security Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security Settings
              </CardTitle>
              <CardDescription>
                Configure additional security options for your account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Login Alerts</Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified when someone signs in to your account
                    </p>
                  </div>
                  <Switch
                    checked={securitySettings.loginAlerts}
                    onCheckedChange={(checked) => setSecuritySettings({
                      ...securitySettings,
                      loginAlerts: checked
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Require Password Change</Label>
                    <p className="text-sm text-muted-foreground">
                      Force password change on next login
                    </p>
                  </div>
                  <Switch
                    checked={securitySettings.requirePasswordChange}
                    onCheckedChange={(checked) => setSecuritySettings({
                      ...securitySettings,
                      requirePasswordChange: checked
                    })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                  <Input
                    id="sessionTimeout"
                    type="number"
                    value={securitySettings.sessionTimeout}
                    onChange={(e) => setSecuritySettings({
                      ...securitySettings,
                      sessionTimeout: parseInt(e.target.value) || 30
                    })}
                    placeholder="30"
                    min="5"
                    max="1440"
                  />
                  <p className="text-sm text-muted-foreground">
                    Automatically log out after this many minutes of inactivity
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSecuritySettingsSave}
                  disabled={!securitySettingsDirty || isSavingSecurity}
                  className="flex items-center gap-2"
                >
                  {isSavingSecurity ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {isSavingSecurity ? 'Saving...' : 'Save Security Settings'}
                </Button>
              </div>
            </CardContent>
          </Card>

          
        </div>
      </div>
    </MainLayout>
  )
}
