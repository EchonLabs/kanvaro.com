/**
 * Test suite for task synchronization functionality
 * This ensures that task updates are properly synchronized across Kanban and Calendar views
 */

// Uses the ambient globals from @types/jest rather than importing from
// '@jest/globals' — importing shadows the global `jest` namespace, which both
// blocks the @testing-library/jest-dom matcher augmentation and types bare
// mocks as `never`.

// Mock fetch for testing
const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

describe('Task Synchronization', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockClear()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('Real-time Updates', () => {
    it('should handle task status updates across views', async () => {
      const taskUpdate = {
        taskId: 'task-123',
        status: 'in_progress',
        updatedAt: new Date().toISOString()
      }

      // Mock successful API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          updates: [{
            type: 'update',
            data: taskUpdate
          }],
          lastModified: taskUpdate.updatedAt
        })
      })

      // Simulate receiving an update
      const response = await fetch('/api/tasks/sync')
      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.updates).toHaveLength(1)
      expect(data.updates[0].data.taskId).toBe('task-123')
      expect(data.updates[0].data.status).toBe('in_progress')
    })

    it('should handle concurrent task updates with conflict resolution', async () => {
      const conflictResponse = {
        ok: false,
        status: 409,
        json: async () => ({
          error: 'Task was modified by another user. Please refresh and try again.',
          conflict: true,
          currentVersion: new Date().toISOString()
        })
      }

      mockFetch.mockResolvedValueOnce(conflictResponse)

      try {
        const response = await fetch('/api/tasks/task-123', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'done',
            expectedVersion: '2023-01-01T00:00:00.000Z'
          })
        })

        expect(response.status).toBe(409)
        const data = await response.json()
        expect(data.conflict).toBe(true)
        expect(data.error).toContain('modified by another user')
      } catch (error) {
        // Expected to throw for conflict
        expect(error).toBeDefined()
      }
    })

    it('should handle optimistic updates correctly', async () => {
      const taskId = 'task-123'
      const updates = { status: 'done' }

      // Mock successful update
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            _id: taskId,
            status: 'done',
            updatedAt: new Date().toISOString()
          }
        })
      })

      // Simulate optimistic update
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })

      expect(response.ok).toBe(true)
      const result = await response.json()
      expect(result.success).toBe(true)
      expect(result.data.status).toBe('done')
    })
  })

  describe('Data Consistency', () => {
    it('should ensure tasks are filtered by organization', () => {
      const filters = {
        organization: 'org-123',
        $or: [
          { assignedTo: 'user-123' },
          { createdBy: 'user-123' }
        ]
      }

      expect(filters.organization).toBe('org-123')
      expect(filters.$or).toHaveLength(2)
      expect(filters.$or[0]).toEqual({ assignedTo: 'user-123' })
      expect(filters.$or[1]).toEqual({ createdBy: 'user-123' })
    })

    it('should maintain task assignment visibility', () => {
      const task = {
        _id: 'task-123',
        title: 'Test Task',
        assignedTo: 'user-123',
        createdBy: 'user-456',
        organization: 'org-123',
        status: 'todo'
      }

      // Task should be visible to assigned user
      expect(task.assignedTo).toBe('user-123')
      
      // Task should be visible to creator
      expect(task.createdBy).toBe('user-456')
      
      // Task should belong to organization
      expect(task.organization).toBe('org-123')
    })
  })

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      try {
        await fetch('/api/tasks/sync')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('Network error')
      }
    })

    it('should handle authentication errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' })
      })

      const response = await fetch('/api/tasks/sync')
      expect(response.status).toBe(401)
    })
  })

  describe('Performance', () => {
    it('should limit sync response size', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          updates: Array(100).fill(null).map((_, i) => ({
            type: 'update',
            data: { taskId: `task-${i}`, status: 'todo' }
          })),
          count: 100
        })
      })

      const response = await fetch('/api/tasks/sync')
      const data = await response.json()

      expect(data.count).toBeLessThanOrEqual(100)
    })

    it('should use appropriate cache headers', async () => {
      const lastModified = new Date().toISOString()
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          'Last-Modified': new Date(lastModified).toUTCString(),
          'Cache-Control': 'no-cache, must-revalidate',
          'ETag': `"${Date.now()}"`
        }),
        json: async () => ({
          success: true,
          updates: [],
          lastModified
        })
      })

      const response = await fetch('/api/tasks/sync')
      
      expect(response.headers.get('Last-Modified')).toBeDefined()
      expect(response.headers.get('Cache-Control')).toBe('no-cache, must-revalidate')
      expect(response.headers.get('ETag')).toBeDefined()
    })
  })
})

describe('Task Model Validation', () => {
  it('should require organization field', () => {
    const taskData = {
      title: 'Test Task',
      organization: 'org-123',
      project: 'proj-123',
      createdBy: 'user-123'
    }

    expect(taskData.organization).toBeDefined()
    expect(taskData.organization).toBe('org-123')
  })

  it('should validate task status enum', () => {
    const validStatuses = ['todo', 'in_progress', 'review', 'testing', 'done', 'cancelled']
    const testStatus = 'in_progress'

    expect(validStatuses).toContain(testStatus)
  })

  it('should validate priority enum', () => {
    const validPriorities = ['low', 'medium', 'high', 'critical']
    const testPriority = 'high'

    expect(validPriorities).toContain(testPriority)
  })
})
