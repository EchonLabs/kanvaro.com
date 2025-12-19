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
import { usePermissionContext } from '@/lib/permissions/permission-context'
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
  const [verificationRequired, setVerificationRequired] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [resendingVerification, setResendingVerification] = useState(false)
  const [orgRequiresVerification, setOrgRequiresVerification] = useState<boolean | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { organization, loading: orgLoading } = useOrganization()

  // Check organization email verification settings
  useEffect(() => {
    if (organization && !orgLoading) {
      const requiresVerification = organization.settings?.requireEmailVerification ?? true
      setOrgRequiresVerification(requiresVerification)

      // If verification is not required, reset any verification states
      if (!requiresVerification) {
        setVerificationRequired(false)
        setUserEmail('')
      }
    }
  }, [organization, orgLoading])

  useEffect(() => {
    const message = searchParams.get('message')
    const error = searchParams.get('error')
    const success = searchParams.get('success')

    if (message === 'setup-completed') {
      setSuccessMessage('Setup completed successfully! Please log in with your admin credentials.')
    } else if (success) {
      setSuccessMessage(success)
      // If email verification was successful, clear verification states
      if (success.includes('Email verified')) {
        setVerificationRequired(false)
        setUserEmail('')
      }
    } else if (error) {
      setError(error)
    }
  }, [searchParams])

  const handleResendVerification = async () => {
    if (!userEmail) return

    setResendingVerification(true)
    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: userEmail }),
      })

      const data = await response.json()

      if (data.success) {
        setSuccessMessage('Verification email sent successfully. Please check your inbox.')
        setError('')
      } else {
        setError(data.error || 'Failed to send verification email')
      }
    } catch (err) {
      setError('Failed to send verification email')
    } finally {
      setResendingVerification(false)
    }
  }

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
            console.log('Permissions loaded successfully, redirecting to dashboard')

            // Permissions will be cached by the permission context, redirect to dashboard
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

        // Handle email verification requirement
        if (data.requiresVerification) {
          setVerificationRequired(true)
          setUserEmail(data.email || email)
          setError('')
        } else {
          setError(data.error || 'Login failed. Please try again.')
        }
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
                  <Alert className="bg-green-50 dark:bg-green-900 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200">
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

                {orgRequiresVerification && verificationRequired && (
                  <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900">
                    <AlertDescription className="text-amber-800 dark:text-amber-200">
                      <div className="space-y-2">
                        <div>
                          <strong>Email verification required</strong>
                          <p className="mt-1 text-sm">
                            Your account requires email verification before you can sign in.
                            We've sent a verification link to <strong>{userEmail}</strong>.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleResendVerification}
                            disabled={resendingVerification}
                            className="text-xs"
                          >
                            {resendingVerification ? (
                              <>
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                Sending...
                              </>
                            ) : (
                              'Resend Email'
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            onClick={() => {
                              setVerificationRequired(false)
                              setError('')
                            }}
                            className="text-xs h-auto p-0 text-amber-700 dark:text-amber-300"
                          >
                            Try different email
                          </Button>
                        </div>
                      </div>
                    </AlertDescription>
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
                  disabled={isLoading || isLoadingPermissions || (orgRequiresVerification ? !!verificationRequired : false)}
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
