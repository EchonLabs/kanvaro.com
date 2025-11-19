'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog'
import { 
  X, 
  Plus, 
  GripVertical,
  AlertTriangle,
  Loader2,
  Save,
  Trash2,
  CheckCircle
} from 'lucide-react'

interface ColumnSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  currentColumns: Array<{
    key: string
    title: string
    color?: string
    order: number
  }>
  onColumnsUpdated: () => void
}

export default function ColumnSettingsModal({ 
  isOpen, 
  onClose, 
  projectId, 
  currentColumns, 
  onColumnsUpdated 
}: ColumnSettingsModalProps) {
  const [columns, setColumns] = useState(currentColumns)
  const [originalColumns, setOriginalColumns] = useState(currentColumns)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [newColumnTitle, setNewColumnTitle] = useState('')
  const [newColumnKey, setNewColumnKey] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [columnToDelete, setColumnToDelete] = useState<number | null>(null)
  const [tasksInColumn, setTasksInColumn] = useState<number>(0)
  const [migrationColumn, setMigrationColumn] = useState<string>('')
  const [checkingTasks, setCheckingTasks] = useState(false)
  const [migratingTasks, setMigratingTasks] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setColumns(currentColumns)
      setOriginalColumns(JSON.parse(JSON.stringify(currentColumns))) // Deep copy
      setError('')
      setSuccess('')
      
      // Show informational message if projectId is missing (shouldn't happen if button is properly disabled)
      if (!projectId || projectId.trim() === '' || projectId === 'all') {
        setError('Column settings can only be managed for a specific project. Please select a project from the dropdown above.')
      }
    }
  }, [isOpen, currentColumns, projectId])

  // Scroll to top when error or success message appears
  useEffect(() => {
    if ((error || success) && contentRef.current) {
      contentRef.current.scrollTop = 0
    }
  }, [error, success])

  // Compare current columns with original to detect changes
  const hasChanges = () => {
    if (columns.length !== originalColumns.length) return true
    
    // Sort by order for comparison
    const sortedColumns = [...columns].sort((a, b) => a.order - b.order)
    const sortedOriginal = [...originalColumns].sort((a, b) => a.order - b.order)
    
    for (let i = 0; i < sortedColumns.length; i++) {
      const col = sortedColumns[i]
      const orig = sortedOriginal[i]
      
      if (!orig || col.key !== orig.key || col.title !== orig.title || col.order !== orig.order) {
        return true
      }
    }
    
    return false
  }

  const addColumn = () => {
    if (!newColumnTitle.trim() || !newColumnKey.trim()) return

    // Check if key already exists
    const keyExists = columns.some(col => col.key === newColumnKey.toLowerCase().replace(/\s+/g, '_'))
    if (keyExists) {
      setError('A column with this key already exists. Please use a different key.')
      setSuccess('')
      return
    }

    const newColumn = {
      key: newColumnKey.toLowerCase().replace(/\s+/g, '_'),
      title: newColumnTitle.trim(),
      color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
      order: columns.length > 0 ? Math.max(...columns.map(c => c.order || 0), -1) + 1 : 0
    }

    setColumns([...columns, newColumn])
    setNewColumnTitle('')
    setNewColumnKey('')
    setError('')
  }

  const checkTasksInColumn = async (columnKey: string): Promise<number> => {
    try {
      const response = await fetch(`/api/tasks?project=${projectId}&status=${columnKey}`)
      const data = await response.json()
      
      if (data.success && Array.isArray(data.data)) {
        return data.data.length
      }
      return 0
    } catch (error) {
      console.error('Error checking tasks:', error)
      return 0
    }
  }

  const handleDeleteClick = async (index: number) => {
    const column = columns[index]
    setColumnToDelete(index)
    setMigrationColumn('')
    setDeleteConfirmOpen(true)
    setCheckingTasks(true)
    setError('')
    
    try {
      const taskCount = await checkTasksInColumn(column.key)
      setTasksInColumn(taskCount)
      
      // If there are tasks, set default migration column to first available column
      // Require the user to explicitly pick a destination column
      if (taskCount > 0) {
        setMigrationColumn('')
      }
    } catch (error) {
      console.error('Error checking tasks:', error)
      setError('Failed to check tasks in column')
    } finally {
      setCheckingTasks(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (columnToDelete === null) return

    const column = columns[columnToDelete]
    
    // If there are tasks and no migration column selected, show error
    if (tasksInColumn > 0 && !migrationColumn) {
      setError('Please select a destination column to move tasks to')
      return
    }

    setMigratingTasks(true)
    setError('')

    try {
      // If there are tasks, migrate them first
      if (tasksInColumn > 0 && migrationColumn) {
        // Get all task IDs in this column
        const response = await fetch(`/api/tasks?project=${projectId}&status=${column.key}`)
        const data = await response.json()
        
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          const taskIds = data.data.map((task: any) => task._id)
          
          // Bulk update tasks to new status
          const bulkResponse = await fetch('/api/tasks/bulk', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'update',
              taskIds,
              updates: {
                status: migrationColumn
              }
            })
          })

          const bulkData = await bulkResponse.json()

          if (!bulkResponse.ok || !bulkData.success) {
            throw new Error(bulkData.error || 'Failed to migrate tasks')
          }
        }
      }

      // Remove the column
      setColumns(columns.filter((_, i) => i !== columnToDelete))
      setDeleteConfirmOpen(false)
      setColumnToDelete(null)
      setTasksInColumn(0)
      setMigrationColumn('')
    } catch (error) {
      console.error('Delete error:', error)
      setError(error instanceof Error ? error.message : 'Failed to delete column')
    } finally {
      setMigratingTasks(false)
    }
  }

  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false)
    setColumnToDelete(null)
    setTasksInColumn(0)
    setMigrationColumn('')
    setError('')
  }

  const removeColumn = (index: number) => {
    // This is now replaced by handleDeleteClick
    handleDeleteClick(index)
  }

  const updateColumn = (index: number, field: string, value: string) => {
    const updated = [...columns]
    updated[index] = { ...updated[index], [field]: value }
    setColumns(updated)
  }

  const handleSave = async () => {
    if (!projectId || projectId.trim() === '') {
      setError('Project ID is missing. Please select a project to save column settings.')
      setSuccess('')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          settings: {
            kanbanStatuses: columns
          }
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      
      if (data.success) {
        setOriginalColumns(JSON.parse(JSON.stringify(columns))) // Update original to match current
        setSuccess('Column settings saved successfully!')
        setError('')
        
        // Wait a bit to show success message before closing
        setTimeout(() => {
          onColumnsUpdated()
          onClose()
        }, 1500)
      } else {
        setError(data.error || 'Failed to update columns')
        setSuccess('')
      }
    } catch (error) {
      console.error('Save error:', error)
      setError(error instanceof Error ? error.message : 'Failed to update columns')
      setSuccess('')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const availableMigrationColumns = columns.filter((col, i) => i !== columnToDelete)

  return (
    <>
      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={handleCancelDelete}>
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-[500px] px-4 sm:px-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Column
            </DialogTitle>
            <DialogDescription>
              {tasksInColumn > 0 
                ? `This column contains ${tasksInColumn} task${tasksInColumn !== 1 ? 's' : ''}. Please select a destination column to move these tasks to before deletion.`
                : 'Are you sure you want to delete this column? This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-5 py-4 text-sm">
            {checkingTasks && (
              <div className="flex items-center justify-center rounded-md border border-dashed p-4 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Checking tasks...
              </div>
            )}

            {!checkingTasks && tasksInColumn > 0 && availableMigrationColumns.length > 0 && (
              <div className="space-y-4 rounded-md border bg-muted/30 p-4">
                <div className="space-y-2">
                  <Label htmlFor="migrationColumn" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Move tasks to <span className="text-destructive">*</span>
                  </Label>
                  <Select value={migrationColumn} onValueChange={setMigrationColumn}>
                    <SelectTrigger id="migrationColumn" className="w-full">
                      <SelectValue placeholder="Select a column" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMigrationColumns.map((col) => (
                        <SelectItem key={col.key} value={col.key}>
                          {col.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    All {tasksInColumn} task{tasksInColumn !== 1 ? 's' : ''} will inherit the selected status before deletion.
                  </p>
                </div>
              </div>
            )}

            {!checkingTasks && tasksInColumn > 0 && availableMigrationColumns.length === 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Cannot delete this column because it contains {tasksInColumn} task{tasksInColumn !== 1 ? 's' : ''} and there are no other columns to move them to. Please create another column first.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-2">
            <Button variant="outline" onClick={handleCancelDelete} disabled={migratingTasks} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleConfirmDelete}
              disabled={
                migratingTasks || 
                checkingTasks || 
                (tasksInColumn > 0 && (!migrationColumn || availableMigrationColumns.length === 0))
              }
              className="w-full sm:w-auto"
            >
              {migratingTasks ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {tasksInColumn > 0 ? 'Moving tasks...' : 'Deleting...'}
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Column
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col m-4 sm:m-6">
        <CardHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Manage Kanban Columns</CardTitle>
              <CardDescription>Customize the columns for this project's Kanban board</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent ref={contentRef} className="flex-1 overflow-y-auto">
          <div className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert variant="success">
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            {/* Add new column */}
            <div className="space-y-4">
              <h4 className="text-lg font-medium">Add New Column</h4>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-foreground">
                    Column Title <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={newColumnTitle}
                    onChange={(e) => setNewColumnTitle(e.target.value)}
                    placeholder="e.g., In Review"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">
                    Column Key <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={newColumnKey}
                    onChange={(e) => setNewColumnKey(e.target.value)}
                    placeholder="e.g., in_review"
                    className="mt-1"
                  />
                </div>
              </div>
              <Button onClick={addColumn} disabled={!newColumnTitle.trim() || !newColumnKey.trim()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Column
              </Button>
            </div>

            {/* Existing columns */}
            <div className="space-y-4">
              <h4 className="text-lg font-medium">Current Columns</h4>
              <div className="space-y-3">
                {columns.map((column, index) => (
                  <div key={index} className="flex items-center space-x-3 p-3 border rounded-lg">
                    <div className="flex items-center space-x-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <Badge className={column.color}>
                        {column.title}
                      </Badge>
                    </div>
                    <div className="flex-1 grid gap-2 md:grid-cols-2">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">
                          Title <span className="text-destructive">*</span>
                        </label>
                        <Input
                          value={column.title}
                          onChange={(e) => updateColumn(index, 'title', e.target.value)}
                          className="h-8"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">
                          Key <span className="text-destructive">*</span>
                        </label>
                        <Input
                          value={column.key}
                          onChange={(e) => updateColumn(index, 'key', e.target.value)}
                          className="h-8"
                        />
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeColumn(index)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </CardContent>
        <div className="flex-shrink-0 px-4 sm:px-6 pb-4 sm:pb-6 pt-3 sm:pt-4 border-t">
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-0 sm:space-x-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!hasChanges() || loading || !projectId || projectId.trim() === '' || projectId === 'all'}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
    </>
  )
}
