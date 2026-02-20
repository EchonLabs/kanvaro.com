'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/landing')
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      Redirecting…
    </div>
  )
}
