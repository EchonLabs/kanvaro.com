'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Shield, Key, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function SecuritySettings() {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

  const handlePasswordChange = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' })
      return
    }

    if (passwordData.newPassword.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters long' })
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      const response = await fetch('/api/settings/security/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update password')
      }

      setMessage({ type: 'success', text: 'Password updated successfully' })
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update password. Please check your current password.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Change Password
          </CardTitle>
          <CardDescription>
            Update your account password to keep your account secure.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                  placeholder="Enter your current password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                >
                  {showCurrentPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                  placeholder="Enter your new password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                  placeholder="Confirm your new password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {message && (
            <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
              {message.type === 'error' ? <AlertCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end">
            <Button onClick={handlePasswordChange} disabled={saving} className="flex items-center gap-2">
              {saving ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <Key className="h-4 w-4" />
              )}
              {saving ? 'Changing...' : 'Change Password'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Information
          </CardTitle>
          <CardDescription>
            View your account security status and recent activity.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Last Login</Label>
              <p className="text-sm text-muted-foreground">Never</p>
            </div>
            
            <div className="space-y-2">
              <Label>Account Created</Label>
              <p className="text-sm text-muted-foreground">Recently</p>
            </div>
            
            <div className="space-y-2">
              <Label>Email Verified</Label>
              <p className="text-sm text-muted-foreground">Yes</p>
            </div>
            
            <div className="space-y-2">
              <Label>Two-Factor Authentication</Label>
              <p className="text-sm text-muted-foreground">Not enabled</p>
            </div>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Two-factor authentication and advanced security features are coming soon. These will provide additional protection for your account.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Sessions</CardTitle>
          <CardDescription>
            Manage your active login sessions across different devices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-1">
                <p className="font-medium">Current Session</p>
                <p className="text-sm text-muted-foreground">This device • Chrome on macOS</p>
                <p className="text-sm text-muted-foreground">Last active: Now</p>
              </div>
              <Button variant="outline" size="sm">
                Current
              </Button>
            </div>
          </div>
          
          <Alert className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Session management features are coming soon. You'll be able to view and revoke sessions from other devices.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}
