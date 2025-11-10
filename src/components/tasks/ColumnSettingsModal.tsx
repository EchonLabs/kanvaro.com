'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  X, 
  Plus, 
  GripVertical,
  AlertTriangle,
  Loader2,
  Save,
  Trash2
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [newColumnTitle, setNewColumnTitle] = useState('')
  const [newColumnKey, setNewColumnKey] = useState('')

  useEffect(() => {
    if (isOpen) {
      setColumns(currentColumns)
    }
  }, [isOpen, currentColumns])

  const addColumn = () => {
    if (!newColumnTitle.trim() || !newColumnKey.trim()) return

    const newColumn = {
      key: newColumnKey.toLowerCase().replace(/\s+/g, '_'),
      title: newColumnTitle,
      color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
      order: Math.max(...columns.map(c => c.order), -1) + 1
    }

    setColumns([...columns, newColumn])
    setNewColumnTitle('')
    setNewColumnKey('')
  }

  const removeColumn = (index: number) => {
    setColumns(columns.filter((_, i) => i !== index))
  }

  const updateColumn = (index: number, field: string, value: string) => {
    const updated = [...columns]
    updated[index] = { ...updated[index], [field]: value }
    setColumns(updated)
  }

  const handleSave = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          'settings.kanbanStatuses': columns
        })
      })

      const data = await response.json()
      
      if (data.success) {
        onColumnsUpdated()
        onClose()
      } else {
        setError(data.error || 'Failed to update columns')
      }
    } catch (error) {
      setError('Failed to update columns')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
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
        <CardContent className="flex-1 overflow-y-auto">
          <div className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Add new column */}
            <div className="space-y-4">
              <h4 className="text-lg font-medium">Add New Column</h4>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-foreground">Column Title</label>
                  <Input
                    value={newColumnTitle}
                    onChange={(e) => setNewColumnTitle(e.target.value)}
                    placeholder="e.g., In Review"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Column Key</label>
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
                        <label className="text-xs font-medium text-muted-foreground">Title</label>
                        <Input
                          value={column.title}
                          onChange={(e) => updateColumn(index, 'title', e.target.value)}
                          className="h-8"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Key</label>
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
            <Button onClick={handleSave} disabled={loading}>
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
  )
}
