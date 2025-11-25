'use client'

import { useCallback, useEffect, useState } from 'react'

import type { TaskStatusKey } from '@/constants/taskStatuses'

export interface KanbanStatusConfig {
  key: TaskStatusKey | string
  title?: string
  order?: number
  color?: string
}

interface UseProjectKanbanStatusesResult {
  statusMap: Map<string, KanbanStatusConfig[]>
  refreshStatuses: () => Promise<void>
  getStatusesForProject: (projectId?: string) => KanbanStatusConfig[] | undefined
  isLoading: boolean
}

export function useProjectKanbanStatuses(autoFetch: boolean = true): UseProjectKanbanStatusesResult {
  const [statusMap, setStatusMap] = useState<Map<string, KanbanStatusConfig[]>>(new Map())
  const [isLoading, setIsLoading] = useState(false)

  const refreshStatuses = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/projects')
      const data = await response.json().catch(() => ({}))

      if (response.ok && data.success && Array.isArray(data.data)) {
        const nextMap = new Map<string, KanbanStatusConfig[]>()
        data.data.forEach((project: any) => {
          if (
            project?._id &&
            project.settings?.kanbanStatuses &&
            Array.isArray(project.settings.kanbanStatuses) &&
            project.settings.kanbanStatuses.length > 0
          ) {
            const statuses = [...project.settings.kanbanStatuses].sort(
              (a: KanbanStatusConfig, b: KanbanStatusConfig) => (a.order ?? 0) - (b.order ?? 0)
            )
            nextMap.set(project._id, statuses)
          }
        })
        setStatusMap(nextMap)
      } else {
        setStatusMap(new Map())
      }
    } catch (error) {
      console.error('Failed to fetch project statuses:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (autoFetch) {
      refreshStatuses()
    }
  }, [autoFetch, refreshStatuses])

  const getStatusesForProject = useCallback(
    (projectId?: string) => {
      if (!projectId) return undefined
      return statusMap.get(projectId)
    },
    [statusMap]
  )

  return {
    statusMap,
    refreshStatuses,
    getStatusesForProject,
    isLoading
  }
}


