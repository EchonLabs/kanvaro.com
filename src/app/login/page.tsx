'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { OrganizationLogo } from '@/components/ui/OrganizationLogo'
import { useOrganization } from '@/hooks/useOrganization'
import { Eye, EyeOff, Loader2, X } from 'lucide-react'
import { getAppVersion } from '@/lib/version'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const { organization, loading: orgLoading } = useOrganization()

  useEffect(() => {
    if (searchParams.get('message') === 'setup-completed') {
      setSuccessMessage('Setup completed successfully! Please log in with your admin credentials.')
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    console.log('Attempting login with:', { email, password: '***' })

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      console.log('Login response status:', response.status)
      const data = await response.json()
      console.log('Login response data:', data)

      if (response.ok && data.success) {
        console.log('Login successful, loading permissions...')
        // Login successful, now load permissions before redirecting
        setIsLoading(false)
        setIsLoadingPermissions(true)
        
        try {
          // Fetch permissions to ensure they're loaded before redirecting
          const permissionsResponse = await fetch('/api/auth/permissions', {
            method: 'GET',
            credentials: 'include'
          })
          
          if (permissionsResponse.ok) {
            const permissionsData = await permissionsResponse.json()
            console.log('Permissions loaded successfully, storing and redirecting to dashboard')
            
            // Store permissions in sessionStorage for persistence across page reloads
            try {
              sessionStorage.setItem('kanvaro_permissions', JSON.stringify(permissionsData))
              sessionStorage.setItem('kanvaro_permissions_timestamp', Date.now().toString())
            } catch (storageError) {
              console.error('Error storing permissions in sessionStorage:', storageError)
            }
            
            // Permissions loaded and stored, now redirect to dashboard
            router.push('/dashboard')
          } else {
            console.error('Failed to load permissions:', permissionsResponse.status)
            // Even if permissions fail, redirect to dashboard (it will handle loading there)
            router.push('/dashboard')
          }
        } catch (permError) {
          console.error('Error loading permissions:', permError)
          // Even if permissions fail, redirect to dashboard (it will handle loading there)
          router.push('/dashboard')
        } finally {
          setIsLoadingPermissions(false)
        }
      } else {
        console.error('Login failed:', data.error)
        setError(data.error || 'Login failed. Please try again.')
        setIsLoading(false)
      }
    } catch (error) {
      console.error('Login failed:', error)
      setError('Login failed. Please check your connection and try again.')
      setIsLoading(false)
      setIsLoadingPermissions(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto">
          {/* Header Section */}
          <div className="text-center mb-8">
            <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-4">
              {orgLoading ? (
                <div className="h-8 w-8 rounded bg-primary/20 animate-pulse" />
              ) : (
                <OrganizationLogo 
                  lightLogo={organization?.logo} 
                  darkLogo={organization?.darkLogo}
                  logoMode={organization?.logoMode}
                  fallbackText={organization?.name?.charAt(0) || 'K'}
                  size="lg"
                  className="rounded"
                />
              )}
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Welcome to {organization?.name || 'Kanvaro'}
            </h1>
            <p className="text-muted-foreground">
              Sign in to your account to continue
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-center">Sign In</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {successMessage && (
                  <Alert>
                    <AlertDescription>{successMessage}</AlertDescription>
                  </Alert>
                )}
                {error && (
                  <Alert variant="destructive" className="relative">
                    <AlertDescription className="pr-8">{error}</AlertDescription>
                    <button
                      type="button"
                      onClick={() => setError('')}
                      className="absolute top-2 right-2 p-1 rounded-md hover:bg-destructive/20 transition-colors"
                      aria-label="Dismiss error"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@kanvaro.com"
                    required
                    disabled={isLoading || isLoadingPermissions}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      disabled={isLoading || isLoadingPermissions}
                      className="w-full pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isLoading || isLoadingPermissions}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || isLoadingPermissions}
                >
                  {isLoadingPermissions ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Preparing your dashboard...
                    </>
                  ) : isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>

                <div className="text-center mt-4">
                  <button
                    type="button"
                    onClick={() => router.push('/forgot-password')}
                    className="text-sm text-primary hover:underline"
                    disabled={isLoading || isLoadingPermissions}
                  >
                    Forgot your password?
                  </button>
                </div>
              </form>

            </CardContent>
          </Card>

          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
              Need help? Check our{' '}
              <a href="/docs/public" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                Documentation
              </a>
            </p>
          </div>

          <div className="mt-6 text-center text-xs text-muted-foreground">
            <span>Version </span>
            <span className="font-mono">{getAppVersion()}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 rounded bg-primary/20 animate-pulse mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
