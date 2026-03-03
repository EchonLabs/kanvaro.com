'use client'

import { useState, useRef } from 'react'
import { Database, TestTube, Lock, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
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
  atOrgLimit?: boolean
}

export const DatabaseConfig = ({ onNext, initialData, atOrgLimit }: DatabaseConfigProps) => {
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
  const [existingData, _setExistingData] = useState<any>(null)
  const existingDataRef = useRef<any>(null)
  const setExistingData = (data: any) => {
    existingDataRef.current = data
    _setExistingData(data)
  }
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'failed' | 'db-not-found'>('idle')
  const [connectionError, setConnectionError] = useState('')
  const { success: notifySuccess, error: notifyError } = useNotify()

  // Reset connection status when any field changes
  const handleFieldChange = (field: string, value: any) => {
    setFormData({ ...formData, [field]: value })
    if (connectionStatus !== 'idle') {
      setConnectionStatus('idle')
      setConnectionError('')
    }
  }

  const handleTestConnection = async (): Promise<boolean> => {
    setIsTesting(true)
    setConnectionStatus('idle')
    setConnectionError('')

    try {
      const response = await fetch('/api/setup/database/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const result = await response.json()

      if (response.ok) {
        // Check if the database actually exists (has collections with data)
        if (result.existingData && !result.existingData.databaseExists) {
          setConnectionStatus('db-not-found')
          setConnectionError(`Database "${formData.database}" does not exist or is empty. Please enter a valid database name.`)
          notifyError({
            title: 'Database Not Found',
            message: `The database "${formData.database}" does not exist or has no data.`
          })
          return false
        }

        setConnectionStatus('success')
        if (result.existingData) {
          notifySuccess({
            title: 'Connection Successful',
            message: 'Connected! Found existing data that will be pre-filled.'
          })
        } else {
          notifySuccess({
            title: 'Connection Successful',
            message: 'Database connection successful!'
          })
        }
        setExistingData(result.existingData || null)
        return true
      } else {
        setConnectionStatus('failed')
        const errMsg = result.error || 'Database connection failed'
        setConnectionError(errMsg)
        notifyError({
          title: 'Connection Failed',
          message: errMsg
        })
        return false
      }
    } catch (error) {
      setConnectionStatus('failed')
      setConnectionError('Could not reach the server. Check if the app is running.')
      notifyError({
        title: 'Connection Failed',
        message: 'Could not reach the server.'
      })
      return false
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
            onNext({ database: formData, existingData: existingDataRef.current })
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
      // For existing database, must verify connection AND database existence before proceeding
      if (connectionStatus === 'db-not-found') {
        notifyError({
          title: 'Cannot Proceed',
          message: `Database "${formData.database}" does not exist. Please enter a valid database name.`
        })
        return
      }
      if (connectionStatus === 'success') {
        onNext({ database: formData, existingData: existingDataRef.current })
      } else {
        // Auto-test when user clicks Next without testing first
        const ok = await handleTestConnection()
        if (ok) {
          setTimeout(() => onNext({ database: formData, existingData: existingDataRef.current }), 800)
        }
      }
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
      {atOrgLimit && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertTitle>Organisation Limit Reached</AlertTitle>
          <AlertDescription>
            This server has reached its maximum number of organisations. You can only connect to an existing database — creating a new organisation is disabled.
          </AlertDescription>
        </Alert>
      )}

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
          className={`p-6 border-2 rounded-lg transition-all ${
            atOrgLimit
              ? 'border-muted opacity-40 cursor-not-allowed'
              : connectionType === 'create'
              ? 'border-primary bg-primary/5 cursor-pointer'
              : 'border-muted hover:border-muted-foreground/50 cursor-pointer'
          }`}
          onClick={() => !atOrgLimit && setConnectionType('create')}
        >
          <div className="text-center">
            <Database className="h-8 w-8 text-primary mx-auto mb-2" />
            <h3 className="font-semibold">Create New Database</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {atOrgLimit ? 'Unavailable — organisation limit reached' : 'Let us create a new database for you'}
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
                  Provide your MongoDB connection details. Username and password are optional if your database has no authentication (common on local servers).
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-2">
                  <Label htmlFor="host">Database Host</Label>
                  <Input
                    id="host"
                    type="text"
                    value={formData.host}
                    onChange={(e) => handleFieldChange('host', e.target.value)}
                    placeholder="localhost"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Use "localhost" for local development or the Docker service name for Docker
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    type="number"
                    value={formData.port}
                    onChange={(e) => handleFieldChange('port', parseInt(e.target.value))}
                    placeholder="27017"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Default MongoDB port is 27017
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="database">Database Name</Label>
                  <Input
                    id="database"
                    type="text"
                    value={formData.database}
                    onChange={(e) => handleFieldChange('database', e.target.value)}
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
                    onChange={(e) => handleFieldChange('authSource', e.target.value)}
                    placeholder="admin"
                  />
                  <p className="text-xs text-muted-foreground">
                    The database to authenticate against (usually "admin")
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="username">Username (Optional)</Label>
                  <Input
                    id="username"
                    type="text"
                    value={formData.username}
                    onChange={(e) => handleFieldChange('username', e.target.value)}
                    placeholder="Leave empty if no auth"
                  />
                  <p className="text-xs text-muted-foreground">
                    MongoDB username — leave empty if your database has no authentication
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password (Optional)</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => handleFieldChange('password', e.target.value)}
                    placeholder="Leave empty if no auth"
                  />
                  <p className="text-xs text-muted-foreground">
                    MongoDB password — leave empty if your database has no authentication
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 py-4">
                <Switch
                  id="ssl"
                  checked={formData.ssl}
                  onCheckedChange={(checked) => handleFieldChange('ssl', checked)}
                />
                <Label htmlFor="ssl">Enable SSL connection</Label>
              </div>

              {/* Connection Status Indicator */}
              {connectionStatus === 'success' && (
                <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-700 dark:text-green-400">Database Found &amp; Connected</AlertTitle>
                  <AlertDescription className="text-green-600 dark:text-green-400">
                    Successfully connected to <strong>{formData.database}</strong> on {formData.host}:{formData.port}.
                    {existingData && (existingData as any).hasUsers && ' Existing admin user data detected — it will be pre-filled in the next steps.'}
                  </AlertDescription>
                </Alert>
              )}

              {connectionStatus === 'db-not-found' && (
                <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-700 dark:text-amber-400">Database Not Found</AlertTitle>
                  <AlertDescription className="text-amber-600 dark:text-amber-400">
                    The database <strong>{formData.database}</strong> does not exist or is empty on {formData.host}:{formData.port}. Please check the database name and try again.
                  </AlertDescription>
                </Alert>
              )}

              {connectionStatus === 'failed' && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Connection Failed</AlertTitle>
                  <AlertDescription>
                    {connectionError || 'Could not connect to the database. Please check your settings.'}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                >
                  {isTesting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                  ) : connectionStatus === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                  ) : connectionStatus === 'failed' || connectionStatus === 'db-not-found' ? (
                    <XCircle className="h-4 w-4 mr-2 text-destructive" />
                  ) : (
                    <TestTube className="h-4 w-4 mr-2" />
                  )}
                  {isTesting ? 'Testing...' : connectionStatus === 'success' ? 'Re-test Connection' : connectionStatus === 'failed' || connectionStatus === 'db-not-found' ? 'Retry Connection' : 'Test Connection'}
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
                    onChange={(e) => handleFieldChange('host', e.target.value)}
                    placeholder="localhost"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Use "localhost" for local development or the Docker service name for Docker
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    type="number"
                    value={formData.port}
                    onChange={(e) => handleFieldChange('port', parseInt(e.target.value))}
                    placeholder="27017"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Default MongoDB port is 27017
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="database">Database Name</Label>
                  <Input
                    id="database"
                    type="text"
                    value={formData.database}
                    onChange={(e) => handleFieldChange('database', e.target.value)}
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
                    onChange={(e) => handleFieldChange('authSource', e.target.value)}
                    placeholder="admin"
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
                    onChange={(e) => handleFieldChange('username', e.target.value)}
                    placeholder="Leave empty if no auth"
                  />
                  <p className="text-xs text-muted-foreground">
                    MongoDB username — leave empty if no authentication
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password (Optional)</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => handleFieldChange('password', e.target.value)}
                    placeholder="Leave empty if no auth"
                  />
                  <p className="text-xs text-muted-foreground">
                    MongoDB password — leave empty if no authentication
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 py-4">
                <Switch
                  id="ssl"
                  checked={formData.ssl}
                  onCheckedChange={(checked) => handleFieldChange('ssl', checked)}
                />
                <Label htmlFor="ssl">Enable SSL connection</Label>
              </div>
            </>
          )}


          <div className="flex flex-col sm:flex-row justify-end gap-3">
            <Button
              type="submit"
              disabled={isCreating || isTesting}
            >
              {isCreating || isTesting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                  {connectionType === 'create' ? 'Setting up database...' : 'Verifying connection...'}
                </>
              ) : connectionType === 'existing' && connectionStatus === 'success' ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Next Step
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
