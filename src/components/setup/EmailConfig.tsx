'use client'

import { useState } from 'react'
import { Mail, TestTube, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useNotify } from '@/lib/notify'

interface EmailConfigProps {
  onNext: (data: any) => void
  onBack: () => void
  initialData?: any
}

export const EmailConfig = ({ onNext, onBack, initialData }: EmailConfigProps) => {
  const [provider, setProvider] = useState<'smtp' | 'azure' | 'skip'>(
    initialData?.provider || 'smtp'
  )
  const [smtpConfig, setSmtpConfig] = useState({
    host: initialData?.smtp?.host || '',
    port: initialData?.smtp?.port || 587,
    secure: initialData?.smtp?.secure || false,
    username: initialData?.smtp?.username || '',
    password: initialData?.smtp?.password || '',
    fromEmail: initialData?.smtp?.fromEmail || '',
    fromName: initialData?.smtp?.fromName || '',
  })
  const [azureConfig, setAzureConfig] = useState({
    clientId: initialData?.azure?.clientId || '',
    clientSecret: initialData?.azure?.clientSecret || '',
    tenantId: initialData?.azure?.tenantId || '',
    fromEmail: initialData?.azure?.fromEmail || '',
    fromName: initialData?.azure?.fromName || '',
  })
  const [isTesting, setIsTesting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { success: notifySuccess, error: notifyError } = useNotify()

  const handleTestEmail = async () => {
    setIsTesting(true)

    try {
      const response = await fetch('/api/setup/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          smtp: smtpConfig,
          azure: azureConfig,
        }),
      })

      const result = await response.json()

      if (response.ok) {
        notifySuccess({
          title: 'Email Test Successful',
          message: 'Email configuration test successful!'
        })
      } else {
        notifyError({
          title: 'Email Test Failed',
          message: result.error || 'Email test failed'
        })
      }
    } catch (error) {
      notifyError({
        title: 'Email Test Failed',
        message: 'Email test failed'
      })
    } finally {
      setIsTesting(false)
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (provider === 'smtp') {
      if (!smtpConfig.host.trim()) newErrors.host = 'SMTP Host is required'
      if (!smtpConfig.username.trim()) newErrors.username = 'Username is required'
      if (!smtpConfig.password.trim()) newErrors.password = 'Password is required'
      if (!smtpConfig.fromEmail.trim()) newErrors.fromEmail = 'From Email is required'
      if (!smtpConfig.fromName.trim()) newErrors.fromName = 'From Name is required'
      if (smtpConfig.fromEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(smtpConfig.fromEmail)) {
        newErrors.fromEmail = 'Please enter a valid Email Address'
      }
    } else if (provider === 'azure') {
      if (!azureConfig.clientId.trim()) newErrors.clientId = 'Client ID is required'
      if (!azureConfig.clientSecret.trim()) newErrors.clientSecret = 'Client Secret is required'
      if (!azureConfig.tenantId.trim()) newErrors.tenantId = 'Tenant ID is required'
      if (!azureConfig.fromEmail.trim()) newErrors.fromEmail = 'From Email is required'
      if (!azureConfig.fromName.trim()) newErrors.fromName = 'From Name is required'
      if (azureConfig.fromEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(azureConfig.fromEmail)) {
        newErrors.fromEmail = 'Please enter a valid Email Address'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (provider === 'skip' || validateForm()) {
      onNext({
        email: {
          provider,
          smtp: smtpConfig,
          azure: azureConfig,
        }
      })
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start space-x-4 mb-8">
        <div className="flex-shrink-0">
          <Mail className="h-8 w-8 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-foreground mb-2">Email Settings</h2>
          <p className="text-muted-foreground">
            Configure email notifications for your Kanvaro instance
          </p>
        </div>
      </div>

      <div className="bg-card border rounded-lg p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email Provider Selection */}
          <div className="space-y-4">
            <Label>Email Provider</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  provider === 'smtp'
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/50'
                }`}
                onClick={() => setProvider('smtp')}
              >
                <div className="text-center">
                  <Mail className="h-8 w-8 text-primary mx-auto mb-2" />
                  <h3 className="font-semibold">SMTP Server</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Use your own SMTP server
                  </p>
                </div>
              </div>

              <div
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  provider === 'azure'
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/50'
                }`}
                onClick={() => setProvider('azure')}
              >
                <div className="text-center">
                  <Mail className="h-8 w-8 text-primary mx-auto mb-2" />
                  <h3 className="font-semibold">Azure App</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Use Azure App with Exchange Online
                  </p>
                </div>
              </div>

              <div
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  provider === 'skip'
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/50'
                }`}
                onClick={() => setProvider('skip')}
              >
                <div className="text-center">
                  <Mail className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <h3 className="font-semibold">Skip Email</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Configure later in admin panel
                  </p>
                </div>
              </div>
            </div>
          </div>

        {provider === 'smtp' && (
          <div className="space-y-4">
            <Alert>
              <Mail className="h-4 w-4" />
              <AlertTitle>SMTP Configuration</AlertTitle>
              <AlertDescription>
                Configure your SMTP server settings. Common providers: Gmail (smtp.gmail.com:587), Outlook (smtp-mail.outlook.com:587), or your custom SMTP server.
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="smtp-host">SMTP Host *</Label>
                <Input
                  id="smtp-host"
                  type="text"
                  value={smtpConfig.host}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, host: e.target.value.trim() })}
                  placeholder="smtp.gmail.com"
                  className={errors.host ? 'border-red-500' : ''}
                />
                {errors.host && (
                  <p className="text-sm text-red-600">{errors.host}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtp-port">Port *</Label>
                <Input
                  id="smtp-port"
                  type="number"
                  value={smtpConfig.port}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, port: parseInt(e.target.value) })}
                  placeholder="587"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="secure"
                checked={smtpConfig.secure}
                onCheckedChange={(checked) => setSmtpConfig({ ...smtpConfig, secure: checked })}
              />
              <Label htmlFor="secure">Use SSL/TLS</Label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="smtp-username">Username *</Label>
                <Input
                  id="smtp-username"
                  type="text"
                  value={smtpConfig.username}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, username: e.target.value.trim() })}
                  placeholder="your-email@gmail.com"
                  className={errors.username ? 'border-red-500' : ''}
                />
                {errors.username && (
                  <p className="text-sm text-red-600">{errors.username}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtp-password">Password *</Label>
                <Input
                  id="smtp-password"
                  type="password"
                  value={smtpConfig.password}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, password: e.target.value })}
                  placeholder="Email account password"
                  className={errors.password ? 'border-red-500' : ''}
                />
                {errors.password && (
                  <p className="text-sm text-red-600">{errors.password}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="smtp-from-email">From Email *</Label>
                <Input
                  id="smtp-from-email"
                  type="email"
                  value={smtpConfig.fromEmail}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, fromEmail: e.target.value.trim() })}
                  placeholder="noreply@yourcompany.com"
                  className={errors.fromEmail ? 'border-red-500' : ''}
                />
                {errors.fromEmail && (
                  <p className="text-sm text-red-600">{errors.fromEmail}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtp-from-name">From Name *</Label>
                <Input
                  id="smtp-from-name"
                  type="text"
                  value={smtpConfig.fromName}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, fromName: e.target.value.trim() })}
                  placeholder="Your Company"
                  className={errors.fromName ? 'border-red-500' : ''}
                />
                {errors.fromName && (
                  <p className="text-sm text-red-600">{errors.fromName}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {provider === 'azure' && (
          <div className="space-y-4">
            <Alert>
              <Mail className="h-4 w-4" />
              <AlertTitle>Azure App Configuration</AlertTitle>
              <AlertDescription>
                Configure your Azure App registration for Exchange Online. You'll need to create an app in Azure Portal and grant it Mail.Send permissions.
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="azure-client-id">Client ID *</Label>
                <Input
                  id="azure-client-id"
                  type="text"
                  value={azureConfig.clientId}
                  onChange={(e) => setAzureConfig({ ...azureConfig, clientId: e.target.value })}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className={errors.clientId ? 'border-red-500' : ''}
                />
                {errors.clientId && (
                  <p className="text-sm text-red-600">{errors.clientId}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="azure-tenant-id">Tenant ID *</Label>
                <Input
                  id="azure-tenant-id"
                  type="text"
                  value={azureConfig.tenantId}
                  onChange={(e) => setAzureConfig({ ...azureConfig, tenantId: e.target.value })}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className={errors.tenantId ? 'border-red-500' : ''}
                />
                {errors.tenantId && (
                  <p className="text-sm text-red-600">{errors.tenantId}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="azure-client-secret">Client Secret *</Label>
              <Input
                id="azure-client-secret"
                type="password"
                value={azureConfig.clientSecret}
                onChange={(e) => setAzureConfig({ ...azureConfig, clientSecret: e.target.value })}
                placeholder="Enter your Azure app client secret"
                className={errors.clientSecret ? 'border-red-500' : ''}
              />
              {errors.clientSecret && (
                <p className="text-sm text-red-600">{errors.clientSecret}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="azure-from-email">From Email *</Label>
                <Input
                  id="azure-from-email"
                  type="email"
                  value={azureConfig.fromEmail}
                  onChange={(e) => setAzureConfig({ ...azureConfig, fromEmail: e.target.value })}
                  placeholder="noreply@yourcompany.com"
                  className={errors.fromEmail ? 'border-red-500' : ''}
                />
                {errors.fromEmail && (
                  <p className="text-sm text-red-600">{errors.fromEmail}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="azure-from-name">From Name *</Label>
                <Input
                  id="azure-from-name"
                  type="text"
                  value={azureConfig.fromName}
                  onChange={(e) => setAzureConfig({ ...azureConfig, fromName: e.target.value })}
                  placeholder="Your Company"
                  className={errors.fromName ? 'border-red-500' : ''}
                />
                {errors.fromName && (
                  <p className="text-sm text-red-600">{errors.fromName}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {provider !== 'skip' && (
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestEmail}
              disabled={isTesting}
            >
              {isTesting ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
              ) : (
                <TestTube className="h-4 w-4 mr-2" />
              )}
              Test Email
            </Button>

          </div>
        )}

        {provider === 'skip' && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <p className="font-medium">Email notifications disabled</p>
              <p>You can configure email settings later in the admin panel.</p>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col sm:flex-row justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
          >
            Back
          </Button>
          <Button
            type="submit"
          >
            Next Step
          </Button>
        </div>
      </form>
    </div>
  </div>
  )
}
