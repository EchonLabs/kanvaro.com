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

function SignInForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
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

  useEffect(() => {
    let isMounted = true
    const performGuards = async () => {
      try {
        // Redirect authenticated users to dashboard
        const authResponse = await fetch('/api/auth/me')
        if (!isMounted) return
        if (authResponse.ok) {
          router.replace('/dashboard')
          return
        }

        // Ensure setup is completed before allowing sign in
        const setupResponse = await fetch('/api/setup/status')
        if (!isMounted) return
        if (setupResponse.ok) {
          const setupData = await setupResponse.json()
          if (!setupData.setupCompleted) {
            router.replace('/setup')
          }
        }
      } catch (err) {
        console.error('Pre-auth checks failed:', err)
      }
    }

    performGuards()
    return () => {
      isMounted = false
    }
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        router.push('/dashboard')
      } else {
        setError(data.error || 'Login failed. Please try again.')
      }
    } catch (error) {
      console.error('Login failed:', error)
      setError('Login failed. Please check your connection and try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto">
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
                    disabled={isLoading}
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
                      disabled={isLoading}
                      className="w-full pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isLoading}
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
                  disabled={isLoading}
                >
                  {isLoading ? (
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
                    disabled={isLoading}
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

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 rounded bg-primary/20 animate-pulse mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    }>
      <SignInForm />
    </Suspense>
  )
}

