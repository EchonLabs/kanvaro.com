'use client'

import React from 'react'
import {
  ArrowLeft,
  CalendarRange,
  Wallet,
  Gauge,
  Users,
  Plus,
  Upload,
  Edit,
  BarChart3
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { formatToTitleCase } from '@/lib/utils'

export interface ProjectViewHeaderData {
  _id: string
  name: string
  description?: string
  status: 'draft' | 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled' | string
  projectNumber?: number
  isDraft?: boolean
  startDate?: string | Date
  endDate?: string | Date
  budget?: {
    total: number
    spent: number
    currency?: string
  }
  progress?: {
    completionPercentage: number
    tasksCompleted: number
    totalTasks: number
  }
  teamMembers?: Array<{
    _id?: string
    memberId?: {
      _id?: string
      firstName?: string
      lastName?: string
      email?: string
      avatar?: string
      role?: string
    } | string
    firstName?: string
    lastName?: string
    email?: string
    avatar?: string
    role?: string
  }>
  createdBy?: {
    _id?: string
    firstName?: string
    lastName?: string
    email?: string
    avatar?: string
  }
  projectRoles?: Array<{
    user?: {
      _id?: string
      firstName?: string
      lastName?: string
      email?: string
      avatar?: string
    } | string
    role?: string
  }>
}

interface ProjectViewHeaderProps {
  project: ProjectViewHeaderData
  canUpdateProject?: boolean
  canCreateTask?: boolean
  onBack: () => void
  onAddTask: () => void
  onBulkUpload: () => void
  onEditProject: () => void
  onGoToTeam: () => void
  onGoToReports: () => void
  formatCurrency: (amount: number) => string
}

export function ProjectViewHeader({
  project,
  canUpdateProject = true,
  canCreateTask = true,
  onBack,
  onAddTask,
  onBulkUpload,
  onEditProject,
  onGoToTeam,
  onGoToReports,
  formatCurrency,
}: ProjectViewHeaderProps) {
  // Status badge config matching screenshot
  const getStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; dot: string; label: string }> = {
      planning: {
        bg: 'bg-blue-50 text-blue-600 border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
        dot: 'bg-blue-500',
        label: 'Planning'
      },
      active: {
        bg: 'bg-emerald-50 text-emerald-600 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
        dot: 'bg-emerald-500',
        label: 'Active'
      },
      on_hold: {
        bg: 'bg-amber-50 text-amber-600 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
        dot: 'bg-amber-500',
        label: 'On Hold'
      },
      completed: {
        bg: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        dot: 'bg-slate-500',
        label: 'Completed'
      },
      cancelled: {
        bg: 'bg-rose-50 text-rose-600 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
        dot: 'bg-rose-500',
        label: 'Cancelled'
      },
      draft: {
        bg: 'bg-yellow-50 text-yellow-700 border-yellow-200/80 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800',
        dot: 'bg-yellow-500',
        label: 'Draft'
      }
    }

    const current = config[status] || {
      bg: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300',
      dot: 'bg-slate-400',
      label: formatToTitleCase(status)
    }

    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-medium border ${current.bg}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${current.dot}`} />
        <span>{current.label}</span>
      </span>
    )
  }

  // Duration computation
  const getDurationText = () => {
    if (!project.startDate || !project.endDate) return 'Not set'
    const start = new Date(project.startDate).getTime()
    const end = new Date(project.endDate).getTime()
    if (isNaN(start) || isNaN(end)) return 'Not set'
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24))
    return days > 0 ? `${days} Days` : '0 Days'
  }

  // Identify Project Manager
  const pmRole = project.projectRoles?.find(r => r.role === 'project_manager')
  const projectManager = (pmRole && typeof pmRole.user === 'object' && pmRole.user !== null)
    ? pmRole.user
    : project.createdBy

  // Identify Team Members
  const teamMembersList = (project.teamMembers || []).map(tm => {
    if (tm.memberId && typeof tm.memberId === 'object') {
      return tm.memberId
    }
    return {
      firstName: tm.firstName || '',
      lastName: tm.lastName || '',
      email: tm.email || '',
      avatar: tm.avatar
    }
  }).filter(m => m.firstName || m.email)

  const progressPercentage = project.progress?.completionPercentage ?? 0
  const tasksCompleted = project.progress?.tasksCompleted ?? 0
  const totalTasks = project.progress?.totalTasks ?? 0
  const teamCount = project.teamMembers?.length || 0

  return (
    <div className="space-y-4">
      {/* Top action & title bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Left: Back button, project number, status badge, and project name */}
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
            {typeof project.projectNumber !== 'undefined' && (
              <>
                <span className="text-muted-foreground/40">-</span>
                <span className="font-medium text-muted-foreground">#{project.projectNumber}</span>
              </>
            )}
            <div className="ml-1">
              {getStatusBadge(project.status)}
            </div>
            {project.isDraft && project.status !== 'draft' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                Draft
              </span>
            )}
          </div>
          <h1
            className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground line-clamp-1 break-words"
            title={project.name}
          >
            {project.name}
          </h1>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
          {canCreateTask && (
            <Button
              onClick={onAddTask}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium h-9 px-4 rounded-lg shadow-sm gap-1.5"
            >
              <Plus className="h-4 w-4" />
              <span>Add Task</span>
            </Button>
          )}

          {canCreateTask && (
            <Button
              variant="outline"
              size="sm"
              onClick={onBulkUpload}
              className="bg-card hover:bg-muted font-medium h-9 px-4 rounded-lg shadow-sm gap-1.5 border-border/80"
            >
              <Upload className="h-4 w-4" />
              <span>Bulk Upload</span>
            </Button>
          )}

          <div className="flex items-center gap-1 border-l border-border/60 pl-2 ml-1">
            {canUpdateProject && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onEditProject}
                      className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Edit Project</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onGoToTeam}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg"
                  >
                    <Users className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>View Team</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onGoToReports}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg"
                  >
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reports & Analytics</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      {/* Main Info Card */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-card p-6 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start gap-6">
          {/* Left section: Description & 2 rows of metadata */}
          <div className="flex-1 min-w-0">
            <div>
              <h3 className="text-xs sm:text-[13px] font-bold text-slate-800 dark:text-slate-100">
                Description
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 break-words whitespace-normal leading-relaxed">
                {project.description || 'Project description'}
              </p>
            </div>

            {/* Metadata Stats Rows */}
            <div className="mt-6 space-y-2">
              {/* Row 1: Duration & Total Budget */}
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <div className="flex items-center gap-1.5">
                  <CalendarRange className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                  <span className="text-slate-400 dark:text-slate-500">
                    Duration: <strong className="font-semibold text-slate-700 dark:text-slate-200">{getDurationText()}</strong>
                  </span>
                </div>
                <span className="text-slate-300 dark:text-slate-700 text-xs select-none">•</span>
                <div className="flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                  <span className="text-slate-400 dark:text-slate-500">
                    Total Budget: <strong className="font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(project.budget?.total || 0)}</strong>
                  </span>
                </div>
                <span className="text-slate-300 dark:text-slate-700 text-xs select-none">•</span>
              </div>

              {/* Row 2: Progress & Team */}
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Gauge className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                  <span className="text-slate-400 dark:text-slate-500">
                    Progress: <strong className="font-semibold text-slate-700 dark:text-slate-200">{progressPercentage}%</strong>
                    <span className="text-slate-400 dark:text-slate-500 text-[11px] ml-1.5">{tasksCompleted} of {totalTasks} tasks</span>
                  </span>
                </div>
                <span className="text-slate-300 dark:text-slate-700 text-xs select-none">•</span>
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                  <span className="text-slate-400 dark:text-slate-500">
                    Team: <strong className="font-semibold text-slate-700 dark:text-slate-200">{teamCount} {teamCount === 1 ? 'Member' : 'Members'} Assigned</strong>
                  </span>
                </div>
                <span className="text-slate-300 dark:text-slate-700 text-xs select-none">•</span>
              </div>
            </div>
          </div>

          {/* Right section: Project Manager & Team Members avatars */}
          <div className="flex flex-col items-end shrink-0 text-right self-stretch md:self-auto gap-4">
            {/* Project Manager */}
            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Project Manager
              </p>
              <div className="flex justify-end">
                <GravatarAvatar
                  user={projectManager}
                  size={32}
                  className="h-8 w-8 rounded-full ring-2 ring-white dark:ring-slate-900 shadow-sm"
                />
              </div>
            </div>

            {/* Team Members */}
            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Team Members
              </p>
              <div className="flex items-center justify-end -space-x-1.5 overflow-hidden py-0.5">
                {teamMembersList.slice(0, 6).map((member, i) => (
                  <GravatarAvatar
                    key={i}
                    user={member}
                    size={28}
                    className="h-7 w-7 rounded-full ring-2 ring-white dark:ring-slate-900 shadow-sm inline-block"
                  />
                ))}
                {teamMembersList.length > 6 && (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300 ring-2 ring-white dark:ring-slate-900 shadow-sm">
                    +{teamMembersList.length - 6}
                  </div>
                )}
                {teamMembersList.length === 0 && (
                  <span className="text-xs text-slate-400">No members</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
