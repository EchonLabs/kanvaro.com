'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function HomePage() {
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    checkAuthAndSetup()
  }, [])

  const checkAuthAndSetup = async () => {
    try {
      // First check if user is already authenticated
      const authResponse = await fetch('/api/auth/me')
      if (authResponse.ok) {
        // User is authenticated, redirect to dashboard
        router.push('/dashboard')
        return
      }

      // If not authenticated, check if setup is complete
      const setupResponse = await fetch('/api/setup/status')
      const setupData = await setupResponse.json()
      
      if (!setupData.setupCompleted) {
        // Setup not complete, redirect to setup
        console.log('Setup not completed, redirecting to setup')
        router.push('/setup')
      } else {
        // Setup complete but not authenticated, redirect to login
        console.log('Setup completed, redirecting to login')
        router.push('/login')
      }
    } catch (error) {
      console.error('Failed to check auth and setup status:', error)
      // On error, try to redirect to setup
      router.push('/setup')
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // This should not be reached as we redirect in useEffect
  return null
}
