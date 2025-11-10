'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/Button'
import { Loader2, MailPlus, ShieldCheck } from 'lucide-react'

export default function SignUpPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [selfServiceEnabled, setSelfServiceEnabled] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    const checkStatus = async () => {
      try {
        const [setupRes, orgRes] = await Promise.all([
          fetch('/api/setup/status'),
          fetch('/api/organization')
        ])

        if (!isMounted) return

        if (setupRes.ok) {
          const setupData = await setupRes.json()
          if (!setupData.setupCompleted) {
            router.replace('/setup')
            return
          }
        }

        if (orgRes.ok) {
          const orgData = await orgRes.json()
          setSelfServiceEnabled(!!orgData?.settings?.allowSelfRegistration)
        } else {
          setSelfServiceEnabled(false)
        }
      } catch (err) {
        console.error('Failed to check sign-up availability:', err)
        setError('We could not verify whether self-service sign-up is enabled. Please contact your administrator.')
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    checkStatus()
    return () => {
      isMounted = false
    }
  }, [router])

  const handleRequestAccess = () => {
    router.push('/accept-invitation')
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground text-sm">
            Preparing the sign-up experience...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-xl">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-semibold">Create an Account</CardTitle>
          <p className="text-sm text-muted-foreground">
            Join your team on Kanvaro. Already have an account?{' '}
            <button
              className="text-primary hover:underline font-medium"
              onClick={() => router.push('/sign-in')}
            >
              Sign in
            </button>
            .
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!selfServiceEnabled ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center text-primary">
                <ShieldCheck className="h-12 w-12" />
              </div>
              <div className="space-y-2 text-center">
                <h2 className="text-lg font-semibold">Self-Service Sign-Up Disabled</h2>
                <p className="text-sm text-muted-foreground">
                  Your Kanvaro administrator currently requires invitations to create new accounts. 
                  Request an invitation to get started or check your email for an existing invite.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button className="w-full" onClick={handleRequestAccess}>
                  <MailPlus className="h-4 w-4 mr-2" />
                  Accept Invitation
                </Button>
                <Button variant="outline" className="w-full" onClick={() => router.push('/docs/public')}>
                  View Documentation
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-center text-primary">
                <MailPlus className="h-12 w-12" />
              </div>
              <div className="space-y-2 text-center">
                <h2 className="text-lg font-semibold">Self-Service Sign-Up</h2>
                <p className="text-sm text-muted-foreground">
                  Self-registration is enabled. Please use your invitation link or contact the administrator if you have not received one.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button className="w-full" onClick={handleRequestAccess}>
                  I have an invitation
                </Button>
                <Button variant="outline" className="w-full" onClick={() => router.push('/docs/public')}>
                  Learn more
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

