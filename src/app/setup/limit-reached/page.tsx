'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Lock, Server, ArrowLeft, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface OrgEntry {
  id: string
  name: string
  slug: string
  setupCompleted: boolean
  dbName: string
}

interface StatusData {
  maxOrganizations: number
  orgCount: number
  organizations: OrgEntry[]
}

export default function LimitReachedPage() {
  const router = useRouter()
  const [status, setStatus] = useState<StatusData | null>(null)

  useEffect(() => {
    fetch('/api/setup/status')
      .then((r) => r.json())
      .then((data) => setStatus(data))
      .catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Icon header */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-orange-100 dark:bg-orange-950 flex items-center justify-center">
              <Server className="w-10 h-10 text-orange-500" />
            </div>
            <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-red-500 flex items-center justify-center">
              <Lock className="w-4 h-4 text-white" />
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Organisation Limit Reached
          </h1>
          <p className="text-muted-foreground">
            This server has reached the maximum number of organisations (
            <span className="font-semibold text-foreground">
              {status?.maxOrganizations ?? 3}
            </span>
            ). No additional organisations can be created.
          </p>
        </div>
        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            className="flex-1 flex items-center justify-center gap-2"
            onClick={() => router.push('/')}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Button>
          <Button
            className="flex-1 flex items-center justify-center gap-2"
            onClick={() => router.push('/login')}
          >
            <LogIn className="w-4 h-4" />
            Go to Login
          </Button>
        </div>
      </div>
    </div>
  )
}
