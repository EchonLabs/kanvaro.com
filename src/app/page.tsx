'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function HomePage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' })
        if (res.ok) {
          router.replace('/dashboard')
        } else {
          router.replace('/landing')
        }
      } catch {
        router.replace('/landing')
      } finally {
        setChecking(false)
      }
    }
    checkAuth()
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      {checking && <Loader2 className="h-6 w-6 animate-spin mr-2" />}
      Redirecting…
    </div>
  )
}
