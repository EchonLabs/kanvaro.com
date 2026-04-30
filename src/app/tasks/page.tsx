'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { PageContent } from '@/components/ui/PageContent'
import TasksClient from '@/components/tasks/TasksClient'
import { useNotify } from '@/lib/notify'
import { useAuthContext } from '@/contexts/AuthContext'

export default function TasksPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext()

  const router = useRouter()
  const searchParams = useSearchParams()
  const successMessage = searchParams.get('success')
  const { success: notifySuccess, error: notifyError } = useNotify()


  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

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
