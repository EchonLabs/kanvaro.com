'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, CheckCircle } from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { PageContent } from '@/components/ui/PageContent'
import TasksClient from '@/components/tasks/TasksClient'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function TasksPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [authError, setAuthError] = useState('')
  const [checkingAuth, setCheckingAuth] = useState(true)
  const successMessage = searchParams.get('success')

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        setAuthError('')
      } else if (res.status === 401) {
        const refreshRes = await fetch('/api/auth/refresh', { method: 'POST' })
        if (refreshRes.ok) {
          setAuthError('')
        } else {
          setAuthError('Session expired')
          setTimeout(() => router.push('/login'), 2000)
        }
      } else {
        router.push('/login')
      }
    } catch (err) {
      setAuthError('Authentication failed')
      setTimeout(() => router.push('/login'), 2000)
    } finally {
      setCheckingAuth(false)
    }
  }, [router])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    if (!successMessage) return
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('success')
      const queryString = params.toString()
      router.replace(queryString ? `/tasks?${queryString}` : '/tasks', { scroll: false })
    }, 3000)
    return () => clearTimeout(timeout)
  }, [successMessage, searchParams, router])

  if (checkingAuth) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Checking session...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (authError) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64 text-center">
          <p className="text-destructive mb-4">{authError}</p>
          <p className="text-muted-foreground">Redirecting to login...</p>
        </div>
      </MainLayout>
    )
  }

  const initialFilters = {
    search: searchParams.get('search') || undefined,
    status: searchParams.get('status') || undefined,
    priority: searchParams.get('priority') || undefined,
    type: searchParams.get('type') || undefined,
    project: searchParams.get('project') || undefined,
  }

  return (
    <MainLayout>
      <PageContent>
        {successMessage && (
          <div className="mb-4">
            <Alert variant="success">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          </div>
        )}
        <TasksClient
          initialTasks={[]}
          initialPagination={{ pageSize: 20, hasMore: false }}
          initialFilters={initialFilters}
        />
      </PageContent>
    </MainLayout>
  )
}
