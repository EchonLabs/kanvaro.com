'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogBody
} from '@/components/ui/Dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useNotify } from '@/lib/notify'

interface TaskCategory {
  key: string
  title: string
  order: number
}

interface TaskCategoryManagerModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  onCategoriesUpdated: (categories: TaskCategory[]) => void
}

export default function TaskCategoryManagerModal({
  isOpen,
  onClose,
  projectId,
  onCategoriesUpdated
}: TaskCategoryManagerModalProps) {
  const { success: notifySuccess, error: notifyError } = useNotify()
  const [categories, setCategories] = useState<TaskCategory[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null)
  const [deleteAction, setDeleteAction] = useState<'migrate' | 'unassign'>('migrate')
  const [migrationKey, setMigrationKey] = useState('')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadCategories = useCallback(async (): Promise<TaskCategory[]> => {
    if (!projectId) {
      setCategories([])
      return []
    }

    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/projects/${projectId}/task-categories`)
      const data = await response.json()
      if (!response.ok || !data.success || !Array.isArray(data.data)) {
        throw new Error(data.error || 'Failed to load task categories')
      }
      setCategories(data.data)
      return data.data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load task categories')
      setCategories([])
      return []
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (!isOpen) return
    loadCategories()
  }, [isOpen, loadCategories])

  useEffect(() => {
    if (isOpen) return
    setNewTitle('')
    setEditingKey(null)
    setEditTitle('')
    setCategoryToDelete(null)
    setDeleteAction('migrate')
    setMigrationKey('')
    setDeleteConfirmOpen(false)
    setError('')
  }, [isOpen])

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    const title = newTitle.trim()
    if (!title || saving) return

    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/projects/${projectId}/task-categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create task category')
      }
      setNewTitle('')
      const updatedCategories = await loadCategories()
      onCategoriesUpdated(updatedCategories)
      notifySuccess({ title: 'Category Created', message: 'Task category created successfully' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task category')
      notifyError({ title: 'Create Failed', message: err instanceof Error ? err.message : 'Failed to create task category' })
    } finally {
      setSaving(false)
    }
  }

  const handleRename = async (category: TaskCategory) => {
    const title = editTitle.trim()
    if (!title || saving) return

    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/projects/${projectId}/task-categories`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: category.key, title })
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to rename task category')
      }
      setEditingKey(null)
      const updatedCategories = await loadCategories()
      onCategoriesUpdated(updatedCategories)
      notifySuccess({ title: 'Category Renamed', message: 'Task category renamed successfully' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename task category')
      notifyError({ title: 'Rename Failed', message: err instanceof Error ? err.message : 'Failed to rename task category' })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteClick = (category: TaskCategory) => {
    const destination = categories.find(item => item.key !== category.key)
    setCategoryToDelete(category.key)
    setDeleteAction('migrate')
    setMigrationKey(destination?.key || '')
    setDeleteConfirmOpen(true)
  }

  const handleDelete = async () => {
    if (!categoryToDelete || (deleteAction === 'migrate' && !migrationKey) || saving) return

    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/projects/${projectId}/task-categories`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: categoryToDelete,
          action: deleteAction,
          ...(deleteAction === 'migrate' ? { targetKey: migrationKey } : {})
        })
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete task category')
      }
      setDeleteConfirmOpen(false)
      setCategoryToDelete(null)
      setDeleteAction('migrate')
      setMigrationKey('')
      const updatedCategories = await loadCategories()
      onCategoriesUpdated(updatedCategories)
      notifySuccess({ title: 'Category Deleted', message: 'Task category deleted successfully' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete task category')
      notifyError({ title: 'Delete Failed', message: err instanceof Error ? err.message : 'Failed to delete task category' })
    } finally {
      setSaving(false)
    }
  }

  const categoryBeingDeleted = categories.find(category => category.key === categoryToDelete)
  const destinationCategories = categories.filter(category => category.key !== categoryToDelete)

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) onClose()
      }}>
        <DialogContent className="sm:max-w-xl flex flex-col max-h-[90vh] overflow-hidden rounded-[var(--apple-radius-xl)] border-[var(--apple-separator)] shadow-2xl bg-[var(--apple-secondary-system-background)]">
          <DialogHeader className="border-b border-[var(--apple-separator)] px-6 py-4 bg-[var(--apple-bg-primary)]">
            <DialogTitle className="text-[17px] font-semibold text-[var(--apple-label)] tracking-tight">
              {deleteConfirmOpen ? 'Delete task category' : 'Manage Task Categories'}
            </DialogTitle>
            <DialogDescription className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">
              {deleteConfirmOpen
                ? 'Choose whether to move or unassign tasks in this category.'
                : 'Create, rename, or remove categories used to organize tasks in this project.'}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="flex-1 overflow-y-auto px-6 py-5">
            {deleteConfirmOpen ? (
              <div className="space-y-5">
                <p className="text-[14px] text-[var(--apple-label)]">
                  Delete <strong>{categoryBeingDeleted?.title}</strong>?
                </p>
                <div>
                  <label className="text-[13px] font-medium text-[var(--apple-secondary-label)]">What should happen to its tasks?</label>
                  <Select value={deleteAction} onValueChange={(value) => setDeleteAction(value as 'migrate' | 'unassign')}>
                    <SelectTrigger className="mt-1.5 w-full h-10 rounded-[var(--apple-radius-pill)] border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[14px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[10050]">
                      <SelectItem value="migrate">Move tasks to another category</SelectItem>
                      <SelectItem value="unassign">Unassign tasks</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {deleteAction === 'migrate' && (
                  <div>
                    <label className="text-[13px] font-medium text-[var(--apple-secondary-label)]">Destination category</label>
                    <Select value={migrationKey} onValueChange={setMigrationKey}>
                      <SelectTrigger className="mt-1.5 w-full h-10 rounded-[var(--apple-radius-pill)] border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[14px]">
                        <SelectValue placeholder="Select a destination" />
                      </SelectTrigger>
                      <SelectContent className="z-[10050]">
                        {destinationCategories.map((category) => (
                          <SelectItem key={category.key} value={category.key}>
                            {category.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {error && (
                  <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-system-red)] bg-[var(--apple-system-red)]/10 px-3 py-2 text-[13px] text-[var(--apple-system-red)]">
                    {error}
                  </div>
                )}
              </div>
            ) : (
            <div className="space-y-4">
              <form onSubmit={handleCreate} className="flex gap-2">
                <Input
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder="New category name"
                  maxLength={50}
                  disabled={saving || !projectId}
                  aria-label="New task category name"
                  className="h-10 rounded-[var(--apple-radius-pill)] text-[14px]"
                />
                <Button
                  type="submit"
                  disabled={saving || !newTitle.trim() || !projectId}
                  className="rounded-full h-10 px-5 text-[14px] bg-[var(--apple-system-blue)] text-white hover:opacity-90 font-medium flex-shrink-0"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-1.5" />
                  )}
                  Add
                </Button>
              </form>

              {error && (
                <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-system-red)] bg-[var(--apple-system-red)]/10 px-3 py-2 text-[13px] text-[var(--apple-system-red)]">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                {loading ? (
                  <div className="flex items-center justify-center py-8 text-[13px] text-[var(--apple-secondary-label)]">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading categories...
                  </div>
                ) : categories.length === 0 ? (
                  <div className="rounded-[var(--apple-radius-lg)] border border-dashed border-[var(--apple-separator)] p-6 text-center text-[13px] text-[var(--apple-secondary-label)]">
                    No task categories yet. Add one above to get started.
                  </div>
                ) : (
                  categories.map((category) => (
                    <div
                      key={category.key}
                      className="flex min-h-[44px] items-center gap-2 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-3.5 py-2.5"
                    >
                      {editingKey === category.key ? (
                        <div className="flex flex-1 items-center gap-2 min-w-0">
                          <Input
                            value={editTitle}
                            onChange={(event) => setEditTitle(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                void handleRename(category)
                              }
                              if (event.key === 'Escape') {
                                setEditingKey(null)
                              }
                            }}
                            maxLength={50}
                            disabled={saving}
                            autoFocus
                            aria-label="Rename task category"
                            className="h-9 rounded-[var(--apple-radius-pill)] text-[14px]"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => void handleRename(category)}
                            disabled={saving || !editTitle.trim()}
                            aria-label="Save category name"
                            className="rounded-full h-8 w-8 flex-shrink-0 text-[var(--apple-system-blue)] hover:bg-[var(--apple-tertiary-fill)]"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingKey(null)}
                            disabled={saving}
                            aria-label="Cancel rename"
                            className="rounded-full h-8 w-8 flex-shrink-0 text-[var(--apple-secondary-label)] hover:bg-[var(--apple-tertiary-fill)]"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[14px] font-medium text-[var(--apple-label)]">{category.title}</div>
                            <div className="truncate text-[11px] text-[var(--apple-tertiary-label)]">{category.key}</div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingKey(category.key)
                              setEditTitle(category.title)
                            }}
                            disabled={saving}
                            aria-label={`Rename ${category.title}`}
                            className="rounded-full h-8 w-8 flex-shrink-0 text-[var(--apple-secondary-label)] hover:bg-[var(--apple-tertiary-fill)] hover:text-[var(--apple-label)]"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteClick(category)}
                            disabled={saving || categories.length <= 1}
                            title={categories.length <= 1 ? 'At least one task category is required' : `Delete ${category.title}`}
                            aria-label={`Delete ${category.title}`}
                            className="rounded-full h-8 w-8 flex-shrink-0 text-[var(--apple-system-red)] hover:bg-[var(--apple-system-red)]/10 disabled:text-[var(--apple-tertiary-label)] disabled:hover:bg-transparent"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
            )}
          </DialogBody>

          <DialogFooter className="border-t border-[var(--apple-separator)] bg-[var(--apple-bg-primary)] px-6 py-4 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (deleteConfirmOpen) {
                  setDeleteConfirmOpen(false)
                  setCategoryToDelete(null)
                  setDeleteAction('migrate')
                  setMigrationKey('')
                  setError('')
                  return
                }
                onClose()
              }}
              className="rounded-full px-6 h-10 text-[14px] border-[var(--apple-separator)] font-medium"
            >
              {deleteConfirmOpen ? 'Cancel' : 'Close'}
            </Button>
            {deleteConfirmOpen && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => void handleDelete()}
                disabled={saving || (deleteAction === 'migrate' && !migrationKey)}
                className="rounded-full px-6 h-10 text-[14px] font-medium"
              >
                {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
                Delete
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
