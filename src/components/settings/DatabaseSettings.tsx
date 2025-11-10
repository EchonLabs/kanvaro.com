'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Database, TestTube, AlertCircle, CheckCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function DatabaseSettings() {
  const [testing, setTesting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  
  const [formData, setFormData] = useState({
    host: 'localhost',
    port: 27017,
    database: 'kanvaro',
    username: '',
    password: '',
    authSource: 'admin',
    ssl: false
  })

  // Load existing database configuration
  useEffect(() => {
    const loadDatabaseConfig = async () => {
      try {
        const response = await fetch('/api/settings/database')
        if (response.ok) {
          const config = await response.json()
          setFormData({
            host: config.host || 'localhost',
            port: config.port || 27017,
            database: config.database || 'kanvaro',
            username: config.username || '',
            password: config.password || '',
            authSource: config.authSource || 'admin',
            ssl: config.ssl || false
          })
        }
      } catch (error) {
        console.error('Failed to load database configuration:', error)
      } finally {
        setLoading(false)
      }
    }

    loadDatabaseConfig()
  }, [])

  const handleTest = async () => {
    setTesting(true)
    setMessage(null)

    try {
      const response = await fetch('/api/setup/database/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        throw new Error('Database connection test failed')
      }

      setMessage({ type: 'success', text: 'Database connection successful!' })
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to connect to database. Please check your configuration.' })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    setTesting(true)
    setMessage(null)

    try {
      const response = await fetch('/api/settings/database', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        throw new Error('Failed to update database settings')
      }

      setMessage({ type: 'success', text: 'Database settings updated successfully' })
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update database settings' })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-2xl">
            <Database className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
            <span className="truncate">Database Configuration</span>
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Configure your MongoDB database connection settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6 pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-2">
              <Label htmlFor="db-host" className="text-xs sm:text-sm">Host</Label>
              <Input
                id="db-host"
                value={formData.host}
                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                placeholder="localhost"
                className="text-xs sm:text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="db-port" className="text-xs sm:text-sm">Port</Label>
              <Input
                id="db-port"
                type="number"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 27017 })}
                placeholder="27017"
                className="text-xs sm:text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="db-database" className="text-xs sm:text-sm">Database Name</Label>
              <Input
                id="db-database"
                value={formData.database}
                onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                placeholder="kanvaro"
                className="text-xs sm:text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="db-auth-source" className="text-xs sm:text-sm">Authentication Database</Label>
              <Input
                id="db-auth-source"
                value={formData.authSource}
                onChange={(e) => setFormData({ ...formData, authSource: e.target.value })}
                placeholder="admin"
                className="text-xs sm:text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="db-username" className="text-xs sm:text-sm">Username</Label>
              <Input
                id="db-username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="mongodb_user"
                className="text-xs sm:text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="db-password" className="text-xs sm:text-sm">Password</Label>
              <Input
                id="db-password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="••••••••"
                className="text-xs sm:text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="db-ssl"
              checked={formData.ssl}
              onCheckedChange={(checked) => setFormData({ ...formData, ssl: checked })}
              className="flex-shrink-0"
            />
            <Label htmlFor="db-ssl" className="text-xs sm:text-sm">Use SSL/TLS</Label>
          </div>

          {message && (
            <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
              {message.type === 'error' ? (
                <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
              ) : (
                <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
              )}
              <AlertDescription className="text-xs sm:text-sm break-words">{message.text}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-0">
            <Button 
              onClick={handleTest} 
              disabled={testing}
              variant="outline"
              className="flex items-center gap-2 w-full sm:w-auto text-xs sm:text-sm"
            >
              {testing ? (
                <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-b-2 border-current"></div>
              ) : (
                <TestTube className="h-3 w-3 sm:h-4 sm:w-4" />
              )}
              {testing ? 'Testing...' : 'Test Connection'}
            </Button>

            <Button onClick={handleSave} disabled={testing} className="flex items-center gap-2 w-full sm:w-auto text-xs sm:text-sm">
              {testing ? (
                <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-b-2 border-white"></div>
              ) : (
                <Database className="h-3 w-3 sm:h-4 sm:w-4" />
              )}
              {testing ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
