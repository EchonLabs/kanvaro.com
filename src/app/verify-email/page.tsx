'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle, Mail, AlertCircle, RefreshCw } from 'lucide-react'

function VerifyEmailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [showResendForm, setShowResendForm] = useState(false)

  useEffect(() => {
    if (token) {
      // Redirect directly to the API endpoint which will handle the verification and redirect
      window.location.href = `/api/auth/verify-email?token=${token}`
    } else {
      setLoading(false)
      setShowResendForm(true)
    }
  }, [token])

  const handleResendVerification = async (e: React.FormEvent) => {
    e.preventDefault()
    setResending(true)
    setError('')

    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      })

      const data = await response.json()

      if (data.success) {
        setSuccess(true)
      } else {
        setError(data.error || 'Failed to send verification email')
      }
    } catch (err) {
      setError('Failed to send verification email')
    } finally {
      setResending(false)
    }
  }

  if (loading || verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center space-x-2 text-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span>{verifying ? 'Verifying your email...' : 'Loading...'}</span>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">
          <Card className="shadow-lg border-0 bg-card/50 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="text-center">
                <CheckCircle className="h-16 w-16 text-green-600 dark:text-green-400 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-foreground mb-2">Email Sent!</h2>
                <p className="text-muted-foreground mb-4">
                  A new verification email has been sent to <strong>{email}</strong>.
                  Please check your inbox and click the verification link.
                </p>
                <Button onClick={() => router.push('/login')} className="w-full">
                  Go to Login
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Verify Your Email</h1>
          <p className="text-muted-foreground">
            Complete your account setup to start collaborating
          </p>
        </div>

        <Card className="shadow-lg border-0 bg-card/50 backdrop-blur-sm">
          <CardContent className="pt-6">
            {showResendForm ? (
              <form onSubmit={handleResendVerification} className="space-y-6">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the email address associated with your account
                  </p>
                </div>

                <Button type="submit" className="w-full" disabled={resending}>
                  {resending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Send Verification Email
                    </>
                  )}
                </Button>

                <div className="text-center">
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => router.push('/login')}
                    className="text-sm"
                  >
                    Back to Login
                  </Button>
                </div>
              </form>
            ) : (
              <div className="text-center space-y-4">
                <AlertCircle className="h-12 w-12 text-amber-600 dark:text-amber-400 mx-auto" />
                <h2 className="text-xl font-semibold text-foreground">Invalid Verification Link</h2>
                <p className="text-muted-foreground">
                  The verification link is invalid or has expired. Please request a new verification email.
                </p>
                <Button onClick={() => setShowResendForm(true)} className="w-full">
                  <Mail className="mr-2 h-4 w-4" />
                  Request New Verification Email
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-foreground">Loading...</span>
        </div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  )
}
