'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { PageContent } from '@/components/ui/PageContent'
import TasksClient from '@/components/tasks/TasksClient'
import { useNotify } from '@/lib/notify'

export default function TasksPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [authError, setAuthError] = useState('')
  const [checkingAuth, setCheckingAuth] = useState(true)
  const successMessage = searchParams.get('success')
  const { success: notifySuccess, error: notifyError } = useNotify()

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
    notifySuccess({ title: successMessage })
    const params = new URLSearchParams(searchParams.toString())
    params.delete('success')
    const queryString = params.toString()
    router.replace(queryString ? `/tasks?${queryString}` : '/tasks', { scroll: false })
    // notifySuccess is stable enough; omit from deps to avoid re-run loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successMessage, searchParams, router])

  useEffect(() => {
    if (authError) {
      notifyError({ title: authError })
    }
    // notifyError is stable enough; omit from deps to avoid re-run loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authError])

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
        <TasksClient
          initialTasks={[]}
          initialPagination={{ pageSize: 10, hasMore: false }}
          initialFilters={initialFilters}
        />
      </PageContent>
    </MainLayout>
  )
}
