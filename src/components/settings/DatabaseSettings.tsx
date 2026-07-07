'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Database, TestTube, Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { useNotify } from '@/lib/notify'

function FormField({ label, htmlFor, children }: {
  label: string; htmlFor?: string; children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[13px] font-medium text-[var(--apple-label)]">{label}</Label>
      {children}
    </div>
  )
}

export function DatabaseSettings() {
  const { success: notifySuccess, error: notifyError } = useNotify()
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const [formData, setFormData] = useState({
    host: 'localhost',
    port: 27017,
    database: 'kanvaro',
    username: '',
    password: '',
    authSource: 'admin',
    ssl: false,
  })
  const savedConfig = useRef<typeof formData | null>(null)

  useEffect(() => {
    const loadDatabaseConfig = async () => {
      try {
        const response = await fetch('/api/settings/database')
        if (response.ok) {
          const config = await response.json()
          const loaded = {
            host: config.host || 'localhost',
            port: config.port || 27017,
            database: config.database || 'kanvaro',
            username: config.username || '',
            password: config.password || '',
            authSource: config.authSource || 'admin',
            ssl: config.ssl || false,
          }
          setFormData(loaded)
          savedConfig.current = loaded
        }
      } catch (error) {
        console.error('Failed to load database configuration:', error)
      } finally {
        setLoading(false)
      }
    }
    loadDatabaseConfig()
  }, [])

  const hasChanges = !savedConfig.current || JSON.stringify(formData) !== JSON.stringify(savedConfig.current)

  const handleTest = async () => {
    setTesting(true)
    try {
      const response = await fetch('/api/setup/database/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (!response.ok) throw new Error('Database connection test failed')
      notifySuccess({ title: 'Database Test Successful', message: 'Database connection is working correctly' })
    } catch {
      notifyError({ title: 'Database Test Failed', message: 'Failed to connect to database. Please check your configuration.' })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/settings/database', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (!response.ok) throw new Error('Failed to update database settings')
      savedConfig.current = { ...formData }
      notifySuccess({ title: 'Database Settings Updated', message: 'Database configuration has been updated successfully' })
    } catch (error) {
      notifyError({ title: 'Update Failed', message: error instanceof Error ? error.message : 'Failed to update database settings' })
    } finally {
      setSaving(false)
    }
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

      <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--apple-separator)]">
          <Database className="h-5 w-5 flex-shrink-0 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
          <div>
            <p className="text-[15px] font-semibold text-[var(--apple-label)]">Database Configuration</p>
            <p className="text-[12px] text-[var(--apple-secondary-label)] mt-0.5">Configure your MongoDB database connection settings</p>
          </div>
        </div>

        <div className="px-5 py-5 space-y-5">

          {/* Connection info */}
          <div className="space-y-2">
            <p className="apple-section-label">Connection</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Host" htmlFor="db-host">
                <Input id="db-host" value={formData.host}
                  onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                  placeholder="localhost" />
              </FormField>
              <FormField label="Port" htmlFor="db-port">
                <Input id="db-port" type="number" value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 27017 })}
                  placeholder="27017" />
              </FormField>
              <FormField label="Database Name" htmlFor="db-database">
                <Input id="db-database" value={formData.database}
                  onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                  placeholder="kanvaro" />
              </FormField>
              <FormField label="Authentication Database" htmlFor="db-auth-source">
                <Input id="db-auth-source" value={formData.authSource}
                  onChange={(e) => setFormData({ ...formData, authSource: e.target.value })}
                  placeholder="admin" />
              </FormField>
            </div>
          </div>

          {/* Auth */}
          <div className="space-y-2 pt-3 border-t border-[var(--apple-separator)]">
            <p className="apple-section-label">Authentication</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Username" htmlFor="db-username">
                <Input id="db-username" value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="mongodb_user" />
              </FormField>
              <FormField label="Password" htmlFor="db-password">
                <Input id="db-password" type="password" value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••" />
              </FormField>
            </div>
          </div>

          {/* Security */}
          <div className="space-y-3 pt-3 border-t border-[var(--apple-separator)]">
            <p className="apple-section-label">Security</p>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[13px] font-medium text-[var(--apple-label)]">Use SSL/TLS</p>
                <p className="text-[12px] text-[var(--apple-secondary-label)]">Encrypt the database connection with SSL/TLS</p>
              </div>
              <Switch id="db-ssl" checked={formData.ssl}
                onCheckedChange={(v) => setFormData({ ...formData, ssl: v })} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--apple-separator)]">
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testing || saving}
              className="h-9 gap-2 px-4 rounded-[var(--apple-radius-sm)] apple-transition text-[13px] border-[var(--apple-separator)]"
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> : <TestTube className="h-3.5 w-3.5" strokeWidth={1.5} />}
              {testing ? 'Testing…' : 'Test Connection'}
            </Button>

            <Button
              onClick={handleSave}
              disabled={saving || testing || !hasChanges}
              className="h-9 gap-2 px-4 rounded-[var(--apple-radius-sm)] apple-transition text-[13px]"
              style={{ background: hasChanges ? 'var(--apple-card-gradient)' : undefined }}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> : <Save className="h-3.5 w-3.5" strokeWidth={1.5} />}
              {saving ? 'Saving…' : 'Save Configuration'}
            </Button>
          </div>

        </div>
      </div>
    </div>
  )
}
