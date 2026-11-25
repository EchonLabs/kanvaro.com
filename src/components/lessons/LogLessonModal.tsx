'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter
} from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Save, Loader2, Settings2 } from 'lucide-react'
import { useNotify } from '@/lib/notify'
import { Permission, PermissionGate } from '@/lib/permissions'
import TaskCategoryManagerModal from '@/components/tasks/TaskCategoryManagerModal'

export interface LessonCategory {
  key: string
  title: string
  order?: number
}

export interface LessonData {
  _id?: string
  lessonNumber?: number
  category: string
  impactLevel: 'low' | 'medium' | 'high' | 'critical'
  context: string
  rootCause?: string
  actionRecommendation: string
  modifiedBy?: {
    _id: string
    firstName: string
    lastName: string
    email: string
    avatar?: string
    role?: string
  }
  createdAt?: string
  updatedAt?: string
}

interface LogLessonModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  categories?: LessonCategory[]
  onCategoriesUpdated?: (categories: LessonCategory[], deleteInfo?: { deletedKey: string; targetKey?: string; lessonTargetKey?: string }) => void
  initialData?: LessonData | null
  onSuccess: () => void
}

const IMPACT_LEVELS = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' }
]

export function LogLessonModal({
  isOpen,
  onClose,
  projectId,
  categories = [],
  onCategoriesUpdated,
  initialData,
  onSuccess
}: Readonly<LogLessonModalProps>) {
  const { success: notifySuccess, error: notifyError } = useNotify()
  const isEditing = Boolean(initialData?._id)

  const [category, setCategory] = useState('')
  const [impactLevel, setImpactLevel] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
  const [context, setContext] = useState('')
  const [rootCause, setRootCause] = useState('')
  const [actionRecommendation, setActionRecommendation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false)
  const hasFetchedRef = useRef(false)

  const fetchCategories = useCallback(async () => {
    if (!projectId) return
    setLoadingCategories(true)
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/task-categories`)
      const data = await response.json()
      if (response.ok && data.success && Array.isArray(data.data)) {
        const sorted = [...data.data].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        onCategoriesUpdated?.(sorted)
      }
    } catch (err) {
      console.error('Failed to fetch task categories:', err)
    } finally {
      setLoadingCategories(false)
    }
  }, [projectId, onCategoriesUpdated])

  useEffect(() => {
    if (!isOpen) {
      hasFetchedRef.current = false
      return
    }
    if (categories.length === 0 && !hasFetchedRef.current) {
      hasFetchedRef.current = true
      void fetchCategories()
    }
  }, [isOpen, fetchCategories, categories.length])

  useEffect(() => {
    if (initialData) {
      setCategory(initialData.category || '')
      setImpactLevel(initialData.impactLevel || 'medium')
      setContext(initialData.context || '')
      setRootCause(initialData.rootCause || '')
      setActionRecommendation(initialData.actionRecommendation || '')
    } else {
      setCategory('')
      setImpactLevel('medium')
      setContext('')
      setRootCause('')
      setActionRecommendation('')
    }
    setError(null)
  }, [initialData, isOpen])

  const handleCategoriesUpdated = useCallback(
    (
      updatedCategories: Array<{ key: string; title: string; order: number }>,
      deleteInfo?: { deletedKey: string; targetKey?: string; lessonTargetKey?: string }
    ) => {
      onCategoriesUpdated?.(updatedCategories, deleteInfo)
      setCategory((current) => {
        if (!current) return ''
        if (
          deleteInfo &&
          (current === deleteInfo.deletedKey ||
            current.toLowerCase() === deleteInfo.deletedKey.toLowerCase())
        ) {
          return deleteInfo.lessonTargetKey || ''
        }
        const match = updatedCategories.find(
          (c) =>
            c.key === current ||
            c.key.toLowerCase() === current.toLowerCase() ||
            c.title.toLowerCase() === current.toLowerCase()
        )
        return match ? match.key : ''
      })
    },
    [onCategoriesUpdated]
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!category.trim() || !context.trim() || !actionRecommendation.trim()) {
      const msg = 'Please fill in all required fields.'
      setError(msg)
      notifyError({ title: 'Validation Error', message: msg })
      return
    }

    setLoading(true)
    setError(null)

    try {
      const url = isEditing ? `/api/lessons/${initialData!._id}` : '/api/lessons'
      const method = isEditing ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          category,
          impactLevel,
          context: context.trim(),
          rootCause: rootCause.trim(),
          actionRecommendation: actionRecommendation.trim()
        })
      })

      const data = await response.json().catch(() => ({ error: 'Failed to save lesson' }))
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save lesson')
      }

      notifySuccess({
        title: isEditing ? 'Lesson Updated' : 'Lesson Logged',
        message: isEditing
          ? 'The lesson has been updated successfully.'
          : 'Your lesson has been logged successfully.'
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      console.error('Error saving lesson:', err)
      const msg = err.message || 'Failed to save lesson'
      setError(msg)
      notifyError({
        title: isEditing ? 'Failed to Update Lesson' : 'Failed to Log Lesson',
        message: msg
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
        <DialogContent className="sm:max-w-[512px] w-full flex flex-col max-h-[90vh] p-0 overflow-hidden rounded-[var(--apple-radius-xl)] border-[var(--apple-separator)] shadow-2xl bg-[var(--apple-secondary-system-background)]">
          <DialogHeader className="border-b border-[var(--apple-separator)] px-6 py-4 bg-[var(--apple-bg-primary)]">
            <DialogTitle className="text-[17px] font-semibold text-[var(--apple-label)] tracking-tight">
              {isEditing ? 'Edit Lesson' : 'Log Lesson'}
            </DialogTitle>
            <DialogDescription className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">
              Capture the experience, its cause, and how the team can improve
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="flex-1 overflow-y-auto px-6 py-5 thin-scrollbar">
            <form id="log-lesson-form" onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 text-xs rounded-[var(--apple-radius-sm)] bg-[var(--apple-system-red)]/10 text-[var(--apple-system-red)] border border-[var(--apple-system-red)]/20">
                  {error}
                </div>
              )}

              {/* Row 1: Category & Impact Level in 2 columns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 min-h-[20px]">
                    <Label className="text-[13px] font-medium text-[var(--apple-secondary-label)]">
                      Category <span className="text-[var(--apple-system-red)]">*</span>
                    </Label>
                    <PermissionGate permission={Permission.PROJECT_UPDATE} projectId={projectId}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsCategoryManagerOpen(true)}
                        className="h-5 px-1.5 text-xs"
                      >
                        <Settings2 className="h-3.5 w-3.5 mr-1" />
                        Manage
                      </Button>
                    </PermissionGate>
                  </div>
                  <Select value={category} onValueChange={setCategory} disabled={loadingCategories}>
                    <SelectTrigger className="w-full h-10 rounded-[var(--apple-radius-pill)] border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[14px]">
                      <SelectValue placeholder={loadingCategories ? 'Loading...' : 'Category'} />
                    </SelectTrigger>
                    <SelectContent className="z-[10050] max-h-56">
                      {categories.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          No categories found for this project
                        </div>
                      ) : (
                        categories.map((cat) => (
                          <SelectItem key={cat.key} value={cat.key}>
                            {cat.title}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center min-h-[20px]">
                    <Label className="text-[13px] font-medium text-[var(--apple-secondary-label)]">
                      Impact Level <span className="text-[var(--apple-system-red)]">*</span>
                    </Label>
                  </div>
                  <Select
                    value={impactLevel}
                    onValueChange={(val: any) => setImpactLevel(val)}
                  >
                    <SelectTrigger className="w-full h-10 rounded-[var(--apple-radius-pill)] border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[14px] capitalize">
                      <SelectValue placeholder="Impact Level" />
                    </SelectTrigger>
                    <SelectContent className="z-[10050]">
                      {IMPACT_LEVELS.map((lvl) => (
                        <SelectItem key={lvl.value} value={lvl.value}>
                          {lvl.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 2: Context */}
              <div className="space-y-1.5">
                <Label className="text-[13px] font-medium text-[var(--apple-secondary-label)]">
                  Context <span className="text-[var(--apple-system-red)]">*</span>
                </Label>
                <Textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="What happened?"
                  className="w-full h-[64px] min-h-[64px] px-3.5 py-2.5 rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[var(--apple-label)] placeholder:text-[var(--apple-tertiary-label)] text-[14px] resize-none shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-system-blue)]/40 focus-visible:border-[var(--apple-system-blue)] transition-all"
                  required
                />
              </div>

              {/* Row 3: Root Cause */}
              <div className="space-y-1.5">
                <Label className="text-[13px] font-medium text-[var(--apple-secondary-label)]">
                  Root Cause
                </Label>
                <Textarea
                  value={rootCause}
                  onChange={(e) => setRootCause(e.target.value)}
                  placeholder="Why did it happen?"
                  className="w-full h-[64px] min-h-[64px] px-3.5 py-2.5 rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[var(--apple-label)] placeholder:text-[var(--apple-tertiary-label)] text-[14px] resize-none shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-system-blue)]/40 focus-visible:border-[var(--apple-system-blue)] transition-all"
                />
              </div>

              {/* Row 4: Action Recommendation */}
              <div className="space-y-1.5">
                <Label className="text-[13px] font-medium text-[var(--apple-secondary-label)]">
                  Action Recommendation <span className="text-[var(--apple-system-red)]">*</span>
                </Label>
                <Textarea
                  value={actionRecommendation}
                  onChange={(e) => setActionRecommendation(e.target.value)}
                  placeholder="What should the team do differently next time?"
                  className="w-full h-[64px] min-h-[64px] px-3.5 py-2.5 rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[var(--apple-label)] placeholder:text-[var(--apple-tertiary-label)] text-[14px] resize-none shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-system-blue)]/40 focus-visible:border-[var(--apple-system-blue)] transition-all"
                  required
                />
              </div>
            </form>
          </DialogBody>

          <DialogFooter className="border-t border-[var(--apple-separator)] bg-[var(--apple-bg-primary)] px-6 py-4 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="rounded-full px-6 h-10 text-[14px] border-[var(--apple-separator)] font-medium"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="log-lesson-form"
              disabled={loading}
              className="rounded-full px-6 h-10 text-[14px] bg-[var(--apple-system-blue)] text-white hover:opacity-90 font-medium flex items-center gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span>Save Lesson</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TaskCategoryManagerModal
        isOpen={isCategoryManagerOpen}
        onClose={() => setIsCategoryManagerOpen(false)}
        projectId={projectId}
        onCategoriesUpdated={handleCategoriesUpdated}
      />
    </>
  )
}
