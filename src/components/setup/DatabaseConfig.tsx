'use client'

import { useState } from 'react'
import { Database, TestTube } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Switch } from '@/components/ui/switch'
import { useNotify } from '@/lib/notify'

interface DatabaseConfigProps {
  onNext: (data: any) => void
  initialData?: any
}

export const DatabaseConfig = ({ onNext, initialData }: DatabaseConfigProps) => {
  const [connectionType, setConnectionType] = useState<'existing' | 'create'>('existing')
  const [formData, setFormData] = useState({
    host: initialData?.host || 'localhost',
    port: initialData?.port || 27017,
    database: initialData?.database || 'kanvaro',
    username: initialData?.username || '',
    password: initialData?.password || '',
    authSource: initialData?.authSource || 'admin',
    ssl: initialData?.ssl || false,
  })
  const [isTesting, setIsTesting] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [existingData, setExistingData] = useState(null)
  const { success: notifySuccess, error: notifyError } = useNotify()

  const handleTestConnection = async () => {
    setIsTesting(true)

    try {
      const response = await fetch('/api/setup/database/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const result = await response.json()

      if (response.ok) {
        if (result.existingData) {
          notifySuccess({
            title: 'Connection Successful',
            message: 'Database connection successful! Found existing data that will be pre-filled.'
          })
        } else {
          notifySuccess({
            title: 'Connection Successful',
            message: 'Database connection successful!'
          })
        }
        // Store existing data for passing to next steps
        setExistingData(result.existingData || null)
      } else {
        notifyError({
          title: 'Connection Failed',
          message: result.error || 'Database connection failed'
        })
      }
    } catch (error) {
      notifyError({
        title: 'Connection Failed',
        message: 'Database connection failed'
      })
    } finally {
      setIsTesting(false)
    }
  }

  const handleCreateDatabase = async () => {
    setIsCreating(true)

    try {
      const response = await fetch('/api/setup/database/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const result = await response.json()

      if (response.ok) {
        notifySuccess({
          title: 'Database Created',
          message: 'Database created successfully!'
        })
      } else {
        notifyError({
          title: 'Database Creation Failed',
          message: result.error || 'Database creation failed'
        })
      }
    } catch (error) {
      notifyError({
        title: 'Database Creation Failed',
        message: 'Database creation failed'
      })
    } finally {
      setIsCreating(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (connectionType === 'create') {
      // For create database, we need to test the connection first
      setIsCreating(true)

      try {
        const response = await fetch('/api/setup/database/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })

        const result = await response.json()

        if (response.ok) {
          notifySuccess({
            title: 'Database Ready',
            message: 'Database is ready for use!'
          })
          // Proceed to next step after successful creation
          setTimeout(() => {
            onNext({ database: formData, existingData })
          }, 1000)
        } else {
          notifyError({
            title: 'Database Setup Failed',
            message: result.error || 'Database setup failed'
          })
        }
      } catch (error) {
        notifyError({
          title: 'Database Setup Failed',
          message: 'Database setup failed'
        })
      } finally {
        setIsCreating(false)
      }
    } else {
      // For existing database, proceed if test was successful
      onNext({ database: formData, existingData })
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start space-x-4 mb-8">
        <div className="flex-shrink-0">
          <Database className="h-8 w-8 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-foreground mb-2">Database Configuration</h2>
          <p className="text-muted-foreground">
            Choose how you want to set up your database connection
          </p>
        </div>
      </div>

      {/* Connection Type Selection */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div
          className={`p-6 border-2 rounded-lg cursor-pointer transition-all ${
            connectionType === 'existing'
              ? 'border-primary bg-primary/5'
              : 'border-muted hover:border-muted-foreground/50'
          }`}
          onClick={() => setConnectionType('existing')}
        >
          <div className="text-center">
            <Database className="h-8 w-8 text-primary mx-auto mb-2" />
            <h3 className="font-semibold">Connect to Existing Database</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Use an existing MongoDB database
            </p>
          </div>
        </div>

        <div
          className={`p-6 border-2 rounded-lg cursor-pointer transition-all ${
            connectionType === 'create'
              ? 'border-primary bg-primary/5'
              : 'border-muted hover:border-muted-foreground/50'
          }`}
          onClick={() => setConnectionType('create')}
        >
          <div className="text-center">
            <Database className="h-8 w-8 text-primary mx-auto mb-2" />
            <h3 className="font-semibold">Create New Database</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Let us create a new database for you
            </p>
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-lg p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {connectionType === 'existing' && (
            <>
              <Alert>
                <Database className="h-4 w-4" />
                <AlertTitle>Connect to Existing Database</AlertTitle>
                <AlertDescription>
                  Provide your MongoDB connection details. Make sure to test the connection before proceeding.
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-2">
                  <Label htmlFor="host">Database Host</Label>
                  <Input
                    id="host"
                    type="text"
                    value={formData.host}
                    onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                    placeholder="localhost"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Use "localhost" for Docker setup (will connect to internal mongodb service)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    type="number"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                    placeholder="27017"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Use "27017" for Docker setup (internal MongoDB port)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="database">Database Name</Label>
                  <Input
                    id="database"
                    type="text"
                    value={formData.database}
                    onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                    placeholder="kanvaro"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Name of your existing MongoDB database
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="authSource">Authentication Source</Label>
                  <Input
                    id="authSource"
                    type="text"
                    value={formData.authSource}
                    onChange={(e) => setFormData({ ...formData, authSource: e.target.value })}
                    placeholder="Enter username"
                  />
                  <p className="text-xs text-muted-foreground">
                    The database to authenticate against (usually "admin" for MongoDB)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="Enter username"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    MongoDB username with access to the database
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Enter password"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    MongoDB password for the specified username
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 py-4">
                <Switch
                  id="ssl"
                  checked={formData.ssl}
                  onCheckedChange={(checked) => setFormData({ ...formData, ssl: checked })}
                />
                <Label htmlFor="ssl">Enable SSL connection</Label>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                >
                  {isTesting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                  ) : (
                    <TestTube className="h-4 w-4 mr-2" />
                  )}
                  Test Connection
                </Button>
              </div>
            </>
          )}

          {connectionType === 'create' && (
            <>
              <Alert>
                <Database className="h-4 w-4" />
                <AlertTitle>Automatic Database Setup</AlertTitle>
                <AlertDescription>
                  We'll automatically prepare your MongoDB database for Kanvaro. 
                  For Docker deployment, use "localhost" as the host - it will automatically connect to the internal MongoDB service.
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-2">
                  <Label htmlFor="host">Database Host</Label>
                  <Input
                    id="host"
                    type="text"
                    value={formData.host}
                    onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                    placeholder="localhost"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Use "localhost" for Docker setup (will connect to internal mongodb service)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    type="number"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                    placeholder="27017"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Use "27017" for Docker setup (internal MongoDB port)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="database">Database Name</Label>
                  <Input
                    id="database"
                    type="text"
                    value={formData.database}
                    onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                    placeholder="kanvaro_dev"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Database will be created automatically
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="authSource">Authentication Source</Label>
                  <Input
                    id="authSource"
                    type="text"
                    value={formData.authSource}
                    onChange={(e) => setFormData({ ...formData, authSource: e.target.value })}
                    placeholder="Enter username"
                    disabled
                  />
                  <p className="text-xs text-muted-foreground">
                    Pre-configured for Docker setup
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="username">Username (Optional)</Label>
                  <Input
                    id="username"
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="Enter username (optional)"
                  />
                  <p className="text-xs text-muted-foreground">
                    MongoDB username for authentication (leave empty for no authentication)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password (Optional)</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Enter password (optional)"
                  />
                  <p className="text-xs text-muted-foreground">
                    MongoDB password for authentication (leave empty for no authentication)
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 py-4">
                <Switch
                  id="ssl"
                  checked={formData.ssl}
                  onCheckedChange={(checked) => setFormData({ ...formData, ssl: checked })}
                />
                <Label htmlFor="ssl">Enable SSL connection</Label>
              </div>
            </>
          )}


          <div className="flex flex-col sm:flex-row justify-end gap-3">
            <Button
              type="submit"
              disabled={isCreating}
            >
              {isCreating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                  {connectionType === 'create' ? 'Setting up database...' : 'Testing connection...'}
                </>
              ) : (
                'Next Step'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
