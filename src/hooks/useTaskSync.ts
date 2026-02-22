'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface TaskUpdate {
  taskId: string
  status?: string
  priority?: string
  assignedTo?: string
  dueDate?: string
  updatedAt: string
}

interface UseTaskSyncOptions {
  onTaskUpdate?: (update: TaskUpdate) => void
  onTaskCreate?: (task: any) => void
  onTaskDelete?: (taskId: string) => void
  refreshInterval?: number
}

export function useTaskSync(options: UseTaskSyncOptions = {}) {
  const [isConnected, setIsConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const isVisibleRef = useRef(true) // default to true; will be synced client-side in useEffect

  const {
    onTaskUpdate,
    onTaskCreate,
    onTaskDelete,
    refreshInterval = 30000 // Increased to 30 seconds (was 5 seconds)
  } = options

  // Polling mechanism for real-time updates with visibility awareness
  const startPolling = useCallback(async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    // Only poll when tab is visible
    if (!isVisibleRef.current) {
      return
    }

    intervalRef.current = setInterval(async () => {
      // Skip if tab is not visible
      if (!isVisibleRef.current) {
        return
      }

      try {
        const response = await fetch('/api/tasks/sync', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(lastUpdate && { 'If-Modified-Since': lastUpdate })
          }
        })

        if (response.ok) {
          const data = await response.json()

          if (data.success && data.updates) {
            data.updates.forEach((update: any) => {
              if (update.type === 'update' && onTaskUpdate) {
                onTaskUpdate(update.data)
              } else if (update.type === 'create' && onTaskCreate) {
                onTaskCreate(update.data)
              } else if (update.type === 'delete' && onTaskDelete) {
                onTaskDelete(update.data.taskId)
              }
            })

            if (data.lastModified) {
              setLastUpdate(data.lastModified)
            }
          }
        }
      } catch (error) {
        console.error('Task sync polling error:', error)
        setIsConnected(false)
      }
    }, refreshInterval)

    setIsConnected(true)
  }, [lastUpdate, onTaskUpdate, onTaskCreate, onTaskDelete, refreshInterval])

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setIsConnected(false)
  }, [])

  // Optimistic update function with concurrency handling
  const updateTaskOptimistically = useCallback(async (
    taskId: string,
    updates: Partial<TaskUpdate>,
    currentVersion?: string
  ) => {
    try {
      // Immediately call the update callback for instant UI feedback
      if (onTaskUpdate) {
        onTaskUpdate({
          taskId,
          ...updates,
          updatedAt: new Date().toISOString()
        })
      }

      // Send the actual update to the server with version check
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...updates,
          ...(currentVersion && { expectedVersion: currentVersion })
        })
      })

      if (response.status === 409) {
        // Handle concurrency conflict
        const conflictData = await response.json()
        throw new Error(`Conflict: ${conflictData.error}`)
      }

      if (!response.ok) {
        throw new Error('Failed to update task')
      }

      const result = await response.json()

      // Update the last modified timestamp
      if (result.data?.updatedAt) {
        setLastUpdate(result.data.updatedAt)
      }

      return result.data
    } catch (error) {
      console.error('Optimistic update failed:', error)
      // Could implement rollback logic here
      throw error
    }
  }, [onTaskUpdate])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling()
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [stopPolling])

  // Handle visibility changes to pause/resume polling
  useEffect(() => {
    // Sync the initial visibility state on the client
    isVisibleRef.current = !document.hidden

    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden
      if (document.hidden) {
        // Pause polling when tab is hidden
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      } else {
        // Resume polling when tab becomes visible (if was connected)
        if (isConnected) {
          startPolling()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isConnected, startPolling])

  return {
    isConnected,
    startPolling,
    stopPolling,
    updateTaskOptimistically,
    lastUpdate
  }
}

// Hook for managing task state with synchronization
export function useTaskState(initialTasks: any[] = []) {
  const [tasks, setTasks] = useState(initialTasks)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleTaskUpdate = useCallback((update: TaskUpdate) => {
    setTasks(prev => prev.map(task =>
      task._id === update.taskId
        ? { ...task, ...update }
        : task
    ))
  }, [])

  const handleTaskCreate = useCallback((newTask: any) => {
    setTasks(prev => [...prev, newTask])
  }, [])

  const handleTaskDelete = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(task => task._id !== taskId))
  }, [])

  const updateTask = useCallback(async (taskId: string, updates: Partial<TaskUpdate>) => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      })

      if (!response.ok) {
        throw new Error('Failed to update task')
      }

      const result = await response.json()

      if (result.success) {
        handleTaskUpdate({
          taskId,
          ...updates,
          updatedAt: result.data.updatedAt
        })
      }

      return result.data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update task'
      setError(errorMessage)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [handleTaskUpdate])

  const deleteTask = useCallback(async (taskId: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to delete task')
      }

      handleTaskDelete(taskId)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete task'
      setError(errorMessage)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [handleTaskDelete])

  return {
    tasks,
    setTasks,
    isLoading,
    error,
    updateTask,
    deleteTask,
    handleTaskUpdate,
    handleTaskCreate,
    handleTaskDelete
  }
}
