'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Search, Plus, Edit3, Trash2, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { ContentLoader } from '@/components/ui/ContentLoader'
import { LogLessonModal, type LessonData, type LessonCategory } from '@/components/lessons/LogLessonModal'
import { Permission, PermissionGate } from '@/lib/permissions'
import { usePermissions } from '@/lib/permissions/permission-context'
import { useNotify } from '@/lib/notify'
import { useDebounce } from '@/hooks/useDebounce'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { getUserInitials } from '@/lib/gravatar'
import { formatToTitleCase } from '@/lib/utils'

interface ProjectLearningsTabProps {
  projectId: string
  project?: any
}

const IMPACT_BADGE_STYLES: Record<string, { badge: string; dot: string; text: string; label: string }> = {
  critical: {
    badge: 'bg-[#FFF1F2] dark:bg-rose-950/60 border-[#FECDD3] dark:border-rose-800/80',
    dot: 'bg-[#F43F5E] dark:bg-rose-400',
    text: 'text-[#BE123C] dark:text-rose-300',
    label: 'Critical'
  },
  high: {
    badge: 'bg-[#FFF0E2] dark:bg-amber-950/60 border-[#F5BC68] dark:border-amber-800/80',
    dot: 'bg-[#FF9000] dark:bg-amber-400',
    text: 'text-[#FF9000] dark:text-amber-300',
    label: 'High'
  },
  medium: {
    badge: 'bg-[#ECE6FF] dark:bg-purple-950/60 border-[#9D82DF] dark:border-purple-800/80',
    dot: 'bg-[#8D36E9] dark:bg-purple-400',
    text: 'text-[#8D36E9] dark:text-purple-300',
    label: 'Medium'
  },
  low: {
    badge: 'bg-[#EFF6FF] dark:bg-blue-950/60 border-[#BFDBFE] dark:border-blue-800/80',
    dot: 'bg-[#3B82F6] dark:bg-blue-400',
    text: 'text-[#1D4ED8] dark:text-blue-300',
    label: 'Low'
  }
}

export function ProjectLearningsTab({
  projectId,
  project
}: Readonly<ProjectLearningsTabProps>) {
  const { hasPermission } = usePermissions()
  const { success: notifySuccess, error: notifyError } = useNotify()
  const { formatDate, formatTime } = useDateTime()
  const canManageLessons = hasPermission(Permission.PROJECT_UPDATE, projectId)

  const [lessons, setLessons] = useState<LessonData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingLesson, setEditingLesson] = useState<LessonData | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Fetch lessons from API
  const fetchLessons = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        projectId,
        page: page.toString(),
        limit: limit.toString()
      })
      if (debouncedSearch.trim()) {
        params.set('search', debouncedSearch.trim())
      }

      const res = await fetch(`/api/lessons?${params.toString()}`)
      const data = await res.json()

      if (res.ok) {
        setLessons(data.lessons || [])
        setTotal(data.total || 0)
        setTotalPages(data.totalPages || 1)
      } else {
        console.error('Failed to fetch lessons:', data.error)
      }
    } catch (err) {
      console.error('Error fetching lessons:', err)
    } finally {
      setLoading(false)
    }
  }, [projectId, page, limit, debouncedSearch])

  useEffect(() => {
    fetchLessons()
  }, [fetchLessons])

  // Delete handler
  const handleDelete = async () => {
    if (!deletingId) return
    try {
      setIsDeleting(true)
      const res = await fetch(`/api/lessons/${deletingId}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setDeletingId(null)
        notifySuccess({
          title: 'Lesson Deleted',
          message: 'The lesson log has been deleted successfully.'
        })
        fetchLessons()
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to delete lesson' }))
        notifyError({
          title: 'Failed to Delete Lesson',
          message: err.error || 'Could not delete lesson.'
        })
      }
    } catch (err) {
      console.error('Error deleting lesson:', err)
      notifyError({
        title: 'Failed to Delete Lesson',
        message: 'An error occurred while deleting the lesson.'
      })
    } finally {
      setIsDeleting(false)
    }
  }

  // Categories from project settings (kept synced when updated in modal)
  const initialCategories = useMemo<LessonCategory[]>(() => {
    const raw = project?.settings?.taskCategories || []
    return raw.map((c: any) => ({
      key: c.key || c.title,
      title: c.title || c.key,
      order: c.order
    }))
  }, [project])

  const [projectCategories, setProjectCategories] = useState<LessonCategory[]>(initialCategories)

  const handleCategoriesUpdated = useCallback(
    (
      updated: LessonCategory[],
      deleteInfo?: { deletedKey: string; targetKey?: string; lessonTargetKey?: string }
    ) => {
      setProjectCategories(updated)
      if (deleteInfo) {
        setLessons((prev) =>
          prev.map((l) => {
            if (
              l.category === deleteInfo.deletedKey ||
              l.category?.toLowerCase() === deleteInfo.deletedKey.toLowerCase()
            ) {
              return {
                ...l,
                category: deleteInfo.lessonTargetKey || ''
              }
            }
            return l
          })
        )
      }
      fetchLessons()
    },
    [fetchLessons]
  )

  useEffect(() => {
    setProjectCategories(initialCategories)
  }, [initialCategories])

  const getCategoryTitle = useCallback((categoryKey?: string): string => {
    if (!categoryKey) return '-'
    const found = projectCategories.find(
      (c: { key: string; title: string }) =>
        c.key === categoryKey ||
        c.key.toLowerCase() === categoryKey.toLowerCase() ||
        c.title.toLowerCase() === categoryKey.toLowerCase()
    )
    return found ? found.title : categoryKey
  }, [projectCategories])

  const renderImpactBadge = (impact: string) => {
    const style = IMPACT_BADGE_STYLES[impact?.toLowerCase()] || IMPACT_BADGE_STYLES.low
    return (
      <div className={`inline-flex items-center justify-center min-w-[67px] h-[22px] px-[8px] py-[2px] gap-[4px] rounded-[9999px] border ${style.badge}`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
        <span className={`text-[10px] font-semibold capitalize leading-4 ${style.text}`}>
          {style.label}
        </span>
      </div>
    )
  }

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return { date: '-', time: '' }
    return {
      date: formatDate(dateStr) || '-',
      time: formatTime(dateStr)
    }
  }

  if (loading && lessons.length === 0) {
    return <ContentLoader message="Loading project learnings..." size="lg" />
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-card p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Project Learning Record
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Create, review, track, and close lessons learned logs in one place
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative w-full sm:w-[256px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <Input
                type="text"
                placeholder="Search lessons, tags, authors..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                className="pl-[36px] pr-3 h-[36px] text-xs bg-white dark:bg-slate-900 rounded-[8px] border-slate-200 dark:border-slate-800 placeholder:text-slate-400 text-slate-900 dark:text-slate-100"
              />
            </div>

            <PermissionGate permission={Permission.PROJECT_UPDATE} projectId={projectId}>
              <button
                type="button"
                onClick={() => {
                  setEditingLesson(null)
                  setIsModalOpen(true)
                }}
                className="w-[129px] h-[38px] pl-[18px] pr-[14px] py-[8px] rounded-[30px] border border-[#BEDBFF] dark:border-blue-900/60 bg-white dark:bg-slate-900 text-[#0745CC] dark:text-blue-400 hover:bg-blue-50/60 dark:hover:bg-blue-950/40 text-[14px] font-medium leading-5 flex items-center justify-center gap-[7px] shrink-0 transition-colors shadow-none"
              >
                <Plus className="w-[12px] h-[12px] text-[#0745CC] dark:text-blue-400 shrink-0 stroke-[2.5]" />
                <span>Log Lesson</span>
              </button>
            </PermissionGate>
          </div>
        </div>

        <div className="rounded-[12px] border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-card overflow-hidden">
          <div className="overflow-x-auto thin-scrollbar">
            <table className={`w-full text-left border-separate border-spacing-0 ${canManageLessons ? 'min-w-[1520px]' : 'min-w-[1436px]'}`}>
              <thead>
                <tr className="bg-[#F8FAFC] dark:bg-slate-900/60 [&>th]:border-b [&>th]:border-[#F1F5F9] dark:[&>th]:border-slate-800 text-[12px] leading-[16px] font-semibold [&>th]:font-semibold tracking-[0.3px] text-[#62748E] dark:text-slate-400 uppercase h-[42.5px]">
                  {/* Fixed columns */}
                  <th className="sticky left-0 bg-[#F8FAFC] dark:bg-[#141926] z-30 pt-[11px] pb-[10px] px-0 w-[48px] min-w-[48px] max-w-[48px] h-[42.5px] border-b border-[#F1F5F9] dark:border-slate-800 text-center align-middle">
                    ID
                  </th>
                  <th className="sticky left-[48px] bg-[#F8FAFC] dark:bg-[#141926] z-30 py-[11px] pr-0 pl-4 w-[111px] min-w-[111px] max-w-[111px]">
                    CATEGORY
                  </th>
                  <th className="sticky left-[159px] bg-[#F8FAFC] dark:bg-[#141926] z-30 py-[11px] pr-4 pl-3 w-[140px] min-w-[140px] max-w-[140px]">
                    CONTEXT
                  </th>
                  <th className="sticky left-[299px] bg-[#F8FAFC] dark:bg-[#141926] z-30 py-[11px] pr-[6px] pl-[10px] w-[302px] min-w-[302px] max-w-[302px] border-r border-b border-solid border-[#F8FAFC] dark:border-r-slate-700/60 dark:border-b-slate-800 shadow-[2px_0px_2px_0px_rgba(0,0,0,0.25)] [clip-path:inset(0px_-6px_0px_0px)]">
                    ROOT CAUSE
                  </th>

                  {/* Scrollable columns */}
                  <th className="py-[11px] px-0 w-[136px] min-w-[136px] text-center">
                    IMPACT LEVEL
                  </th>
                  <th className="py-[11px] pr-2 pl-3 w-[270px] min-w-[270px]">
                    ACTION RECOMMENDATION
                  </th>
                  <th className="py-[11px] px-2 w-[130px] min-w-[130px] text-center">
                    <div className="flex flex-col items-center justify-center leading-[16px]">
                      <span>LOGGED</span>
                      <span>DATE & TIME</span>
                    </div>
                  </th>
                  <th className="py-[11px] px-2 w-[140px] min-w-[140px] text-center">
                    <div className="flex flex-col items-center justify-center leading-[16px]">
                      <span>LAST MODIFIED</span>
                      <span>DATE & TIME</span>
                    </div>
                  </th>
                  <th className="py-[11px] pr-2 pl-[12px] w-[154px] min-w-[154px]">
                    MODIFIED BY
                  </th>
                  {canManageLessons && (
                    <th className="py-[11px] px-0 w-[84px] min-w-[84px] text-center">
                      ACTION
                    </th>
                  )}
                </tr>
              </thead>

              <tbody className="[&>tr>td]:border-b [&>tr>td]:border-[#F1F5F9] dark:[&>tr>td]:border-slate-800/80 [&>tr:last-child>td]:border-b-0 bg-white dark:bg-card">
                {loading ? (
                  <tr>
                    <td colSpan={canManageLessons ? 10 : 9} className="py-8">
                      <ContentLoader message="Loading lessons..." />
                    </td>
                  </tr>
                ) : lessons.length === 0 ? (
                  <tr>
                    <td colSpan={canManageLessons ? 10 : 9} className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                      <div className="max-w-sm mx-auto text-center space-y-3">
                        <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 mx-auto flex items-center justify-center">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          No lessons recorded yet
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Record project insights, root causes, and action recommendations for the team.
                        </p>
                        <PermissionGate permission={Permission.PROJECT_UPDATE} projectId={projectId}>
                          <Button
                            onClick={() => {
                              setEditingLesson(null)
                              setIsModalOpen(true)
                            }}
                            size="sm"
                            className="rounded-[8px] bg-blue-600 hover:bg-blue-700 text-white text-xs h-[34px]"
                          >
                            <Plus className="w-3.5 h-3.5 mr-1" />
                            Log First Lesson
                          </Button>
                        </PermissionGate>
                      </div>
                    </td>
                  </tr>
                ) : (
                  lessons.map((lesson, idx) => {
                    const loggedDt = formatDateTime(lesson.createdAt)
                    const modifiedDt = lesson.updatedAt && lesson.updatedAt !== lesson.createdAt
                      ? formatDateTime(lesson.updatedAt)
                      : { date: '-', time: '' }

                    const userInitials = getUserInitials(lesson.modifiedBy?.firstName, lesson.modifiedBy?.lastName)
                    const userName = lesson.modifiedBy
                      ? `${lesson.modifiedBy.firstName || ''} ${lesson.modifiedBy.lastName || ''}`.trim() || lesson.modifiedBy.email
                      : '-'
                    const userRole = formatToTitleCase(lesson.modifiedBy?.role) || 'Project Manager'

                    const displayId = lesson.lessonNumber
                      ? String(lesson.lessonNumber).padStart(3, '0')
                      : String((page - 1) * limit + idx + 1).padStart(3, '0')

                    return (
                      <tr
                        key={lesson._id || idx}
                        className="group hover:bg-[#F8FAFC]/70 dark:hover:bg-[#252a34]/70 transition-colors"
                      >
                        <td className="sticky left-0 bg-white dark:bg-card group-hover:bg-[#F8FAFC] dark:group-hover:bg-[#252a34] z-20 py-3 px-0 w-[48px] min-w-[48px] max-w-[48px] text-center align-middle transition-colors">
                          <div className="inline-flex items-center justify-center w-[34px] h-[19px] bg-[#F1F5F9] dark:bg-slate-800 dark:border dark:border-slate-700/60 rounded-[4px] opacity-100">
                            <span className="tabular-nums font-normal text-[12px] leading-[16px] text-[#90A1B9] dark:text-slate-300">
                              {displayId}
                            </span>
                          </div>
                        </td>

                        <td className="sticky left-[48px] bg-white dark:bg-card group-hover:bg-[#F8FAFC] dark:group-hover:bg-[#252a34] z-20 py-3 pr-0 pl-4 w-[111px] min-w-[111px] max-w-[111px] align-middle transition-colors">
                          <span className="inline-block align-middle font-medium text-[12px] leading-[16px] tracking-[0px] text-[#4D5767] dark:text-slate-300">
                            {getCategoryTitle(lesson.category)}
                          </span>
                        </td>

                        <td className="sticky left-[159px] bg-white dark:bg-card group-hover:bg-[#F8FAFC] dark:group-hover:bg-[#252a34] z-20 py-3 pr-4 pl-3 w-[140px] min-w-[140px] max-w-[140px] align-middle transition-colors">
                          <span className="inline-block align-middle font-semibold text-[12px] leading-[16px] tracking-[0px] text-[#0F172A] dark:text-white">
                            {lesson.context}
                          </span>
                        </td>

                        <td className="sticky left-[299px] bg-white dark:bg-card group-hover:bg-[#F8FAFC] dark:group-hover:bg-[#252a34] z-20 pt-[12px] pr-[6px] pb-[12px] pl-[10px] w-[302px] min-w-[302px] max-w-[302px] h-[122px] opacity-100 align-middle border-r border-b border-solid border-[#F8FAFC] dark:border-r-slate-700/60 dark:border-b-slate-800 shadow-[2px_0px_2px_0px_rgba(0,0,0,0.25)] [clip-path:inset(0px_-6px_0px_0px)] transition-colors">
                          <p className="font-normal text-[12px] leading-5 text-[#0F172A] dark:text-slate-200">
                            {lesson.rootCause || '-'}
                          </p>
                        </td>

                        <td className="py-3 px-0 w-[136px] min-w-[136px] text-center align-middle whitespace-nowrap">
                          {renderImpactBadge(lesson.impactLevel)}
                        </td>

                        <td className="py-3 pr-2 pl-3 w-[270px] min-w-[270px] align-middle">
                          <p className="align-middle font-normal text-[12px] leading-[19.5px] tracking-[0px] text-[#0F172A] dark:text-slate-200">
                            {lesson.actionRecommendation}
                          </p>
                        </td>

                        <td className="py-3 px-2 w-[130px] min-w-[130px] text-center align-middle whitespace-nowrap">
                          <div className="font-normal text-[14px] leading-[20px] tracking-[0px] text-center text-[#45556C] dark:text-slate-200">
                            {loggedDt.date}
                          </div>
                          {loggedDt.time && (
                            <div className="font-normal text-[14px] leading-[20px] tracking-[0px] text-center text-[#45556C] dark:text-slate-200">
                              {loggedDt.time}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-2 w-[140px] min-w-[140px] text-center align-middle whitespace-nowrap">
                          <div className="font-normal text-[14px] leading-[20px] tracking-[0px] text-center text-[#45556C] dark:text-slate-200">
                            {modifiedDt.date}
                          </div>
                          {modifiedDt.time && (
                            <div className="font-normal text-[14px] leading-[20px] tracking-[0px] text-center text-[#45556C] dark:text-slate-200">
                              {modifiedDt.time}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-0 w-[154px] min-w-[154px] align-middle">
                          {lesson.modifiedBy ? (
                            <div className="flex items-center pl-[12px] gap-[8px] w-[142px] min-w-[142px] h-[32px] opacity-100">
                              <div className="w-6 h-6 rounded-full bg-[#2563EB] text-white font-bold text-[10px] leading-4 flex items-center justify-center shrink-0 select-none">
                                {userInitials}
                              </div>
                              <div className="min-w-0">
                                <span className="block truncate align-middle font-semibold text-[11px] leading-[16px] tracking-[0px] text-[#0F172A] dark:text-white">
                                  {userName}
                                </span>
                                <span className="block truncate align-middle font-normal text-[10px] leading-[16px] tracking-[0px] text-[#94A3B8] dark:text-slate-400 capitalize">
                                  {userRole}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="pl-[12px] text-[#94A3B8] dark:text-slate-500">-</span>
                          )}
                        </td>

                        {canManageLessons && (
                          <td className="py-3 px-0 w-[84px] min-w-[84px] text-center align-middle whitespace-nowrap">
                            <div className="inline-flex items-center justify-center gap-2.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingLesson(lesson)
                                  setIsModalOpen(true)
                                }}
                                className="p-1 rounded text-[#4D5767] dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                title="Edit Lesson"
                              >
                                <Edit3 className="w-[18px] h-[18px] opacity-100" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingId(lesson._id!)}
                                className="p-1 rounded text-[#C2000A] dark:text-rose-500 hover:bg-red-50 dark:hover:bg-rose-950/40 transition-colors"
                                title="Delete Lesson"
                              >
                                <Trash2 className="w-[18px] h-[18px] opacity-100" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-[#E8ECF1] dark:border-slate-800 h-[55px] px-[13px] py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-card">
            <div className="font-normal text-[11px] leading-4 text-[#7D8795] dark:text-slate-400">
              Showing {lessons.length} of {total} logs
            </div>

            <div className="flex items-center gap-5">
              <div className="flex items-center gap-1.5">
                <span className="font-normal text-[11px] leading-5 text-[#64748B] dark:text-slate-400">
                  per page:
                </span>
                <Select
                  value={limit.toString()}
                  onValueChange={(val) => {
                    setLimit(Number.parseInt(val, 10))
                    setPage(1)
                  }}
                >
                  <SelectTrigger className="w-[44px] h-[26px] p-1 text-[11px] font-medium text-[#334155] dark:text-slate-200 bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-[6px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs">
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="h-[30px] px-2.5 rounded-full border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 text-[#94A3B8] dark:text-slate-400 disabled:opacity-40 text-[11px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Previous
                </button>
                <span className="font-medium text-[11px] leading-4 text-[#7B889B] dark:text-slate-400 px-1">
                  {page} / {totalPages || 1}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="h-[30px] px-2.5 rounded-full border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 text-[#94A3B8] dark:text-slate-400 disabled:opacity-40 text-[11px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Log / Edit Lesson Modal */}
      {canManageLessons && (
        <LogLessonModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false)
            setEditingLesson(null)
          }}
          projectId={projectId}
          categories={projectCategories}
          onCategoriesUpdated={handleCategoriesUpdated}
          initialData={editingLesson}
          onSuccess={fetchLessons}
        />
      )}

      {/* Delete Confirmation Modal */}
      {canManageLessons && (
        <ConfirmationModal
          isOpen={Boolean(deletingId)}
          onClose={() => setDeletingId(null)}
          onConfirm={handleDelete}
          title="Delete Lesson"
          description="Are you sure you want to delete this lesson learn log? This action cannot be undone."
          confirmText="Delete"
          variant="destructive"
          isLoading={isDeleting}
        />
      )}
    </div>
  )
}

export default ProjectLearningsTab
