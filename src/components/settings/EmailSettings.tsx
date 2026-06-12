'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useOrganization } from '@/hooks/useOrganization'
import { Mail, TestTube, Save, AlertCircle, CheckCircle, Loader2, Server, Cloud, Ban } from 'lucide-react'
import { useNotify } from '@/lib/notify'
import { cn } from '@/lib/utils'

const PROVIDERS = [
  {
    id: 'smtp',
    label: 'SMTP Server',
    description: 'Use your own SMTP server',
    icon: Server,
    gradient: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)',
    glow: 'rgba(0,122,255,0.25)',
  },
  {
    id: 'azure',
    label: 'Azure App',
    description: 'Azure App with Exchange Online',
    icon: Cloud,
    gradient: 'linear-gradient(135deg,#0078D4 0%,#50C0FF 100%)',
    glow: 'rgba(0,120,212,0.25)',
  },
  {
    id: 'skip',
    label: 'Skip Email',
    description: 'Disable email notifications',
    icon: Ban,
    gradient: 'linear-gradient(135deg,#8E8E93 0%,#AEAEB2 100%)',
    glow: 'rgba(142,142,147,0.20)',
  },
] as const

export function EmailSettings() {
  const { success: notifySuccess, error: notifyError } = useNotify()
  const { organization, loading } = useOrganization()
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const [formData, setFormData] = useState({
    provider: 'smtp' as 'smtp' | 'azure' | 'skip',
    smtp: { host: '', port: 587, secure: false, username: '', password: '', fromEmail: '', fromName: '' },
    azure: { clientId: '', clientSecret: '', tenantId: '', fromEmail: '', fromName: '' },
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const savedConfig = useRef<typeof formData | null>(null)

  useEffect(() => {
    const loadEmailConfig = async () => {
      try {
        const response = await fetch('/api/settings/email')
        if (response.ok) {
          const config = await response.json()
          const loaded = {
            provider: config.provider || 'smtp',
            smtp: {
              host: config.smtp?.host || '', port: config.smtp?.port || 587,
              secure: config.smtp?.secure || false, username: config.smtp?.username || '',
              password: config.smtp?.password || '', fromEmail: config.smtp?.fromEmail || '',
              fromName: config.smtp?.fromName || '',
            },
            azure: {
              clientId: config.azure?.clientId || '', clientSecret: config.azure?.clientSecret || '',
              tenantId: config.azure?.tenantId || '', fromEmail: config.azure?.fromEmail || '',
              fromName: config.azure?.fromName || '',
            },
          }
          setFormData(loaded)
          savedConfig.current = loaded
        }
      } catch (error) {
        console.error('Failed to load email configuration:', error)
      }
    }
    loadEmailConfig()
  }, [])

  const hasChanges = !savedConfig.current || JSON.stringify(formData) !== JSON.stringify(savedConfig.current)

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    if (formData.provider === 'smtp') {
      if (!formData.smtp.host.trim()) newErrors.host = 'SMTP Host is required'
      if (!formData.smtp.username.trim()) newErrors.username = 'Username is required'
      if (!formData.smtp.password.trim()) newErrors.password = 'Password is required'
      if (!formData.smtp.fromEmail.trim()) newErrors.fromEmail = 'From Email is required'
      if (!formData.smtp.fromName.trim()) newErrors.fromName = 'From Name is required'
      if (formData.smtp.fromEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.smtp.fromEmail))
        newErrors.fromEmail = 'Please enter a valid Email Address'
    } else if (formData.provider === 'azure') {
      if (!formData.azure.clientId.trim()) newErrors.clientId = 'Client ID is required'
      if (!formData.azure.clientSecret.trim()) newErrors.clientSecret = 'Client Secret is required'
      if (!formData.azure.tenantId.trim()) newErrors.tenantId = 'Tenant ID is required'
      if (!formData.azure.fromEmail.trim()) newErrors.fromEmail = 'From Email is required'
      if (!formData.azure.fromName.trim()) newErrors.fromName = 'From Name is required'
      if (formData.azure.fromEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.azure.fromEmail))
        newErrors.fromEmail = 'Please enter a valid Email Address'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleTestEmail = async () => {
    setTesting(true)
    try {
      const response = await fetch('/api/setup/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      const result = await response.json()
      if (response.ok) {
        notifySuccess({ title: 'Email Test Successful', message: 'Email configuration is working correctly' })
      } else {
        notifyError({ title: 'Email Test Failed', message: result.error || 'Email configuration test failed' })
      }
    } catch {
      notifyError({ title: 'Test Failed', message: 'Network error during email test' })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (formData.provider !== 'skip' && !validateForm()) return
    setSaving(true)
    try {
      const response = await fetch('/api/settings/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (!response.ok) throw new Error('Failed to update email settings')
      savedConfig.current = { ...formData }
      notifySuccess({ title: 'Email Settings Updated', message: 'Email configuration has been updated successfully' })
    } catch (error) {
      notifyError({ title: 'Update Failed', message: error instanceof Error ? error.message : 'Failed to update email settings' })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!validateForm()) return
    await handleTestEmail()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--apple-system-blue)]" />
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* ── Provider card ── */}
      <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--apple-separator)]">
          <div className="flex-shrink-0 w-9 h-9 rounded-[var(--apple-radius-sm)] flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)', boxShadow: '0 3px 10px rgba(0,122,255,0.25)' }}>
            <Mail className="h-[18px] w-[18px] text-white" strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-[var(--apple-label)]">Email Configuration</p>
            <p className="text-[12px] text-[var(--apple-secondary-label)] mt-0.5">Configure your email provider for notifications and invitations</p>
          </div>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Provider selector */}
          <div className="space-y-2">
            <p className="apple-section-label">Email Provider</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {PROVIDERS.map(({ id, label, description, icon: Icon, gradient, glow }) => {
                const active = formData.provider === id
                return (
                  <button
                    key={id}
                    onClick={() => setFormData({ ...formData, provider: id as any })}
                    className={cn(
                      'flex flex-col items-center gap-2 p-4 rounded-[var(--apple-radius-md)] border apple-transition text-center',
                      active
                        ? 'border-[var(--apple-system-blue)] bg-blue-50 dark:bg-blue-950/30'
                        : 'border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] hover:bg-[var(--apple-tertiary-fill)]'
                    )}
                  >
                    <div className="w-10 h-10 rounded-[var(--apple-radius-sm)] flex items-center justify-center"
                      style={{ background: gradient, boxShadow: active ? `0 4px 12px ${glow}` : undefined }}>
                      <Icon className="h-5 w-5 text-white" strokeWidth={1.8} />
                    </div>
                    <div>
                      <p className={cn('text-[13px] font-semibold', active ? 'text-[var(--apple-system-blue)]' : 'text-[var(--apple-label)]')}>{label}</p>
                      <p className="text-[11px] text-[var(--apple-tertiary-label)] mt-0.5">{description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* SMTP fields */}
          {formData.provider === 'smtp' && (
            <div className="space-y-4 pt-1">
              <div className="rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-4 py-3 flex gap-2">
                <Mail className="h-4 w-4 text-[var(--apple-system-blue)] flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-[var(--apple-secondary-label)]">
                  Common providers: Gmail (smtp.gmail.com:587), Outlook (smtp-mail.outlook.com:587).
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="SMTP Host *" htmlFor="smtp-host" error={errors.host}>
                  <Input id="smtp-host" value={formData.smtp.host}
                    onChange={(e) => setFormData({ ...formData, smtp: { ...formData.smtp, host: e.target.value.trim() } })}
                    placeholder="smtp.gmail.com"
                    className={errors.host ? 'border-[var(--apple-system-red)]' : ''} />
                </FormField>
                <FormField label="Port *" htmlFor="smtp-port">
                  <Input id="smtp-port" type="number" value={formData.smtp.port}
                    onChange={(e) => setFormData({ ...formData, smtp: { ...formData.smtp, port: parseInt(e.target.value) || 587 } })}
                    placeholder="587" />
                </FormField>
              </div>

              <div className="flex items-center gap-2.5">
                <Switch id="smtp-secure" checked={formData.smtp.secure}
                  onCheckedChange={(v) => setFormData({ ...formData, smtp: { ...formData.smtp, secure: v } })} />
                <Label htmlFor="smtp-secure" className="text-[13px] text-[var(--apple-label)]">Use SSL/TLS</Label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Username *" htmlFor="smtp-username" error={errors.username}>
                  <Input id="smtp-username" value={formData.smtp.username}
                    onChange={(e) => setFormData({ ...formData, smtp: { ...formData.smtp, username: e.target.value.trim() } })}
                    placeholder="your-email@gmail.com"
                    className={errors.username ? 'border-[var(--apple-system-red)]' : ''} />
                </FormField>
                <FormField label="Password *" htmlFor="smtp-password" error={errors.password}>
                  <Input id="smtp-password" type="password" value={formData.smtp.password}
                    onChange={(e) => setFormData({ ...formData, smtp: { ...formData.smtp, password: e.target.value } })}
                    placeholder="Email account password"
                    className={errors.password ? 'border-[var(--apple-system-red)]' : ''} />
                </FormField>
                <FormField label="From Email *" htmlFor="smtp-from-email" error={errors.fromEmail}>
                  <Input id="smtp-from-email" type="email" value={formData.smtp.fromEmail}
                    onChange={(e) => setFormData({ ...formData, smtp: { ...formData.smtp, fromEmail: e.target.value.trim() } })}
                    placeholder="noreply@yourcompany.com"
                    className={errors.fromEmail ? 'border-[var(--apple-system-red)]' : ''} />
                </FormField>
                <FormField label="From Name *" htmlFor="smtp-from-name" error={errors.fromName}>
                  <Input id="smtp-from-name" value={formData.smtp.fromName}
                    onChange={(e) => setFormData({ ...formData, smtp: { ...formData.smtp, fromName: e.target.value.trim() } })}
                    placeholder="Your Company"
                    className={errors.fromName ? 'border-[var(--apple-system-red)]' : ''} />
                </FormField>
              </div>
            </div>
          )}

          {/* Azure fields */}
          {formData.provider === 'azure' && (
            <div className="space-y-4 pt-1">
              <div className="rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-4 py-3 flex gap-2">
                <Cloud className="h-4 w-4 text-[var(--apple-system-blue)] flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-[var(--apple-secondary-label)]">
                  Create an app in Azure Portal and grant it Mail.Send permissions.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Client ID *" htmlFor="azure-client-id" error={errors.clientId}>
                  <Input id="azure-client-id" value={formData.azure.clientId}
                    onChange={(e) => setFormData({ ...formData, azure: { ...formData.azure, clientId: e.target.value } })}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className={errors.clientId ? 'border-[var(--apple-system-red)]' : ''} />
                </FormField>
                <FormField label="Tenant ID *" htmlFor="azure-tenant-id" error={errors.tenantId}>
                  <Input id="azure-tenant-id" value={formData.azure.tenantId}
                    onChange={(e) => setFormData({ ...formData, azure: { ...formData.azure, tenantId: e.target.value } })}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className={errors.tenantId ? 'border-[var(--apple-system-red)]' : ''} />
                </FormField>
              </div>

              <FormField label="Client Secret *" htmlFor="azure-client-secret" error={errors.clientSecret}>
                <Input id="azure-client-secret" type="password" value={formData.azure.clientSecret}
                  onChange={(e) => setFormData({ ...formData, azure: { ...formData.azure, clientSecret: e.target.value } })}
                  placeholder="Enter your Azure app client secret"
                  className={errors.clientSecret ? 'border-[var(--apple-system-red)]' : ''} />
              </FormField>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="From Email *" htmlFor="azure-from-email" error={errors.fromEmail}>
                  <Input id="azure-from-email" type="email" value={formData.azure.fromEmail}
                    onChange={(e) => setFormData({ ...formData, azure: { ...formData.azure, fromEmail: e.target.value.trim() } })}
                    placeholder="noreply@yourcompany.com"
                    className={errors.fromEmail ? 'border-[var(--apple-system-red)]' : ''} />
                </FormField>
                <FormField label="From Name *" htmlFor="azure-from-name" error={errors.fromName}>
                  <Input id="azure-from-name" value={formData.azure.fromName}
                    onChange={(e) => setFormData({ ...formData, azure: { ...formData.azure, fromName: e.target.value.trim() } })}
                    placeholder="Your Company"
                    className={errors.fromName ? 'border-[var(--apple-system-red)]' : ''} />
                </FormField>
              </div>
            </div>
          )}

          {/* Skip state */}
          {formData.provider === 'skip' && (
            <div className="rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-4 py-5 flex gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--apple-tertiary-fill)] flex items-center justify-center flex-shrink-0">
                <AlertCircle className="h-4 w-4 text-[var(--apple-secondary-label)]" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[var(--apple-label)]">Email notifications disabled</p>
                <p className="text-[12px] text-[var(--apple-secondary-label)] mt-0.5">Email functionality will be disabled for this organization.</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--apple-separator)]">
            {formData.provider !== 'skip' ? (
              <Button
                variant="outline"
                onClick={handleTest}
                disabled={testing || saving}
                className="h-9 gap-2 px-4 rounded-[var(--apple-radius-sm)] apple-transition text-[13px] border-[var(--apple-separator)]"
              >
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
                {testing ? 'Testing…' : 'Test Email'}
              </Button>
            ) : <div />}

            <Button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="h-9 gap-2 px-4 rounded-[var(--apple-radius-sm)] apple-transition text-[13px]"
              style={{ background: hasChanges ? 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)' : undefined }}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saving ? 'Saving…' : 'Save Configuration'}
            </Button>
          </div>

        </div>
      </div>
    </div>
  )
}

function FormField({ label, htmlFor, error, children }: {
  label: string; htmlFor?: string; error?: string; children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[13px] font-medium text-[var(--apple-label)]">{label}</Label>
      {children}
      {error && <p className="text-[11px] text-[var(--apple-system-red)]">{error}</p>}
    </div>
  )
}
