'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import {
  CheckSquare,
  Square,
  Search,
  Loader2,
  UserCheck,
  ClipboardList,
  CheckCircle2,
  ChevronDown,
  X,
  Users,
} from 'lucide-react'
import { useNotify } from '@/lib/notify'
import { PreStandupPanel } from './PreStandupPanel'
import { MemberCommitmentRow } from './MemberCommitmentRow'

interface Member {
  _id: string
  firstName: string
  lastName: string
  avatar?: string
  role?: string
}

interface SprintTask {
  _id: string
  title: string
  status: string
  priority: string
  estimatedHours?: number
}

interface MemberState {
  tasks: SprintTask[]
  loading: boolean
  selectedTaskIds: Set<string>
  saving: boolean
  search: string
}

interface StandupCaptureTabProps {
  session: any
  members: Member[]
  commitments: any[]
  onCommitmentSaved: () => void
  onAddNote: (commitmentId: string, existingNote: any, memberName: string) => void
  onResolveNote: (commitmentId: string) => void
  readOnly: boolean
}

const priorityColors: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-100 text-blue-600',
  high: 'bg-orange-100 text-orange-600',
  critical: 'bg-red-100 text-red-600',
}

function MemberMultiSelect({
  members,
  selectedIds,
  committedIds,
  onChange,
}: {
  members: Member[]
  selectedIds: Set<string>
  committedIds: Set<string>
  onChange: (ids: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const toggle = (id: string) => {
    const next = new Set(selectedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    onChange(next)
  }

  const label =
    selectedIds.size === 0
      ? 'Select team members…'
      : selectedIds.size === members.length
      ? 'All members'
      : `${selectedIds.size} member${selectedIds.size > 1 ? 's' : ''} selected`

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 h-9 px-3 text-sm border border-border rounded-md bg-background hover:border-primary/50 transition-colors"
      >
        <span className="flex items-center gap-2 truncate">
          <Users className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className={selectedIds.size === 0 ? 'text-muted-foreground' : ''}>{label}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 w-full min-w-[220px] rounded-md border border-border bg-popover shadow-md">
          {/* Select all / clear */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => onChange(new Set(members.map((m) => m._id)))}
            >
              Select all
            </button>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => onChange(new Set())}
            >
              Clear
            </button>
          </div>

          <div className="max-h-52 overflow-y-auto py-1">
            {members.map((m) => {
              const checked = selectedIds.has(m._id)
              const committed = committedIds.has(m._id)
              return (
                <button
                  key={m._id}
                  type="button"
                  onClick={() => toggle(m._id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent transition-colors text-left"
                >
                  <div
                    className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                      checked
                        ? 'bg-primary border-primary'
                        : 'border-border'
                    }`}
                  >
                    {checked && (
                      <svg className="h-2.5 w-2.5 text-primary-foreground" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <span className="flex-1 text-sm">{m.firstName} {m.lastName}</span>
                  {committed && (
                    <UserCheck className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Selected chips */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {members
            .filter((m) => selectedIds.has(m._id))
            .map((m) => (
              <span
                key={m._id}
                className="flex items-center gap-1 bg-primary/10 text-primary text-xs rounded-full px-2.5 py-0.5"
              >
                {m.firstName} {m.lastName}
                <button
                  type="button"
                  onClick={() => toggle(m._id)}
                  className="hover:text-primary/70"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
        </div>
      )}
    </div>
  )
}

export function StandupCaptureTab({
  session,
  members,
  commitments,
  onCommitmentSaved,
  onAddNote,
  onResolveNote,
  readOnly,
}: StandupCaptureTabProps) {
  const notify = useNotify()

  const projectId = session.project?._id ?? session.project
  const sprintId = session.sprint

  // Selected member IDs from dropdown
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set())
  // Per-member state: tasks, loading, selection, saving, search
  const [memberStates, setMemberStates] = useState<Map<string, MemberState>>(new Map())

  const committedMemberIds = new Set(commitments.map((c) => c.user?._id ?? c.user))

  const getCommittedTaskIds = (userId: string): Set<string> => {
    const commitment = commitments.find((c) => (c.user?._id ?? c.user) === userId)
    if (!commitment) return new Set()
    return new Set(commitment.tasks?.map((t: any) => t.task?._id ?? t.task) ?? [])
  }

  // Fetch tasks for a member if not already loaded
  const ensureMemberTasks = async (memberId: string) => {
    const existing = memberStates.get(memberId)
    if (existing && (existing.tasks.length > 0 || existing.loading)) return

    setMemberStates((prev) => {
      const next = new Map(prev)
      next.set(memberId, { tasks: [], loading: true, selectedTaskIds: new Set(), saving: false, search: '' })
      return next
    })

    try {
      const sprintPart = sprintId ? `&sprint=${sprintId}` : ''
      const url = `/api/tasks?project=${projectId}&assignedTo=${memberId}${sprintPart}&status=todo,in_progress,review,testing&limit=100`
      const res = await fetch(url)
      const data = await res.json()
      setMemberStates((prev) => {
        const next = new Map(prev)
        const cur = next.get(memberId) ?? { tasks: [], loading: false, selectedTaskIds: new Set(), saving: false, search: '' }
        next.set(memberId, { ...cur, tasks: data.data ?? data.tasks ?? [], loading: false })
        return next
      })
    } catch {
      notify.error({ title: 'Failed to load tasks' })
      setMemberStates((prev) => {
        const next = new Map(prev)
        const cur = next.get(memberId) ?? { tasks: [], loading: false, selectedTaskIds: new Set(), saving: false, search: '' }
        next.set(memberId, { ...cur, loading: false })
        return next
      })
    }
  }

  // When selected members change, fetch their tasks
  const handleMemberSelectionChange = (ids: Set<string>) => {
    setSelectedMemberIds(ids)
    ids.forEach((id) => ensureMemberTasks(id))
  }

  const toggleTask = (memberId: string, taskId: string) => {
    setMemberStates((prev) => {
      const next = new Map(prev)
      const cur = next.get(memberId)
      if (!cur) return prev
      const sel = new Set(cur.selectedTaskIds)
      sel.has(taskId) ? sel.delete(taskId) : sel.add(taskId)
      next.set(memberId, { ...cur, selectedTaskIds: sel })
      return next
    })
  }

  const setSearch = (memberId: string, value: string) => {
    setMemberStates((prev) => {
      const next = new Map(prev)
      const cur = next.get(memberId)
      if (!cur) return prev
      next.set(memberId, { ...cur, search: value })
      return next
    })
  }

  const handleSaveCommitment = async (memberId: string) => {
    const state = memberStates.get(memberId)
    if (!state || state.selectedTaskIds.size === 0) return

    setMemberStates((prev) => {
      const next = new Map(prev)
      const cur = next.get(memberId)!
      next.set(memberId, { ...cur, saving: true })
      return next
    })

    try {
      const existingIds = getCommittedTaskIds(memberId)
      const merged = new Set(Array.from(existingIds).concat(Array.from(state.selectedTaskIds)))
      const allTaskIds = Array.from(merged)

      const res = await fetch(`/api/standup/sessions/${session._id}/commitments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: memberId, taskIds: allTaskIds }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')

      const member = members.find((m) => m._id === memberId)
      notify.success({ title: `Commitment saved for ${member?.firstName}` })

      // Clear selection for this member
      setMemberStates((prev) => {
        const next = new Map(prev)
        const cur = next.get(memberId)!
        next.set(memberId, { ...cur, saving: false, selectedTaskIds: new Set() })
        return next
      })
      onCommitmentSaved()
    } catch (err: any) {
      notify.error({ title: err.message })
      setMemberStates((prev) => {
        const next = new Map(prev)
        const cur = next.get(memberId)!
        next.set(memberId, { ...cur, saving: false })
        return next
      })
    }
  }

  return (
    <div className="space-y-5">
      {/* Pre-standup briefing */}
      {session.briefingSnapshot && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Pre-Standup Briefing
          </p>
          <PreStandupPanel briefing={session.briefingSnapshot} members={members} />
        </div>
      )}

      {/* Commitment capture — only for active sessions */}
      {!readOnly && (
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Today&apos;s Commitments
          </p>

          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No team members found for this project.</p>
          ) : (
            <>
              <MemberMultiSelect
                members={members}
                selectedIds={selectedMemberIds}
                committedIds={committedMemberIds}
                onChange={handleMemberSelectionChange}
              />

              {/* Per-member task cards */}
              {selectedMemberIds.size > 0 && (
                <div className="space-y-3">
                  {members
                    .filter((m) => selectedMemberIds.has(m._id))
                    .map((member) => {
                      const state = memberStates.get(member._id)
                      const committedIds = getCommittedTaskIds(member._id)
                      const filteredTasks = (state?.tasks ?? []).filter((t) =>
                        t.title.toLowerCase().includes((state?.search ?? '').toLowerCase())
                      )

                      return (
                        <Card key={member._id}>
                          <CardContent className="p-4 space-y-3">
                            {/* Card header */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">
                                  {member.firstName} {member.lastName}
                                </p>
                                {committedMemberIds.has(member._id) && (
                                  <Badge variant="outline" className="text-xs border-green-300 text-green-700 py-0">
                                    <UserCheck className="h-3 w-3 mr-1" />
                                    In standup
                                  </Badge>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {(state?.selectedTaskIds.size ?? 0)} selected
                              </span>
                            </div>

                            {/* Search */}
                            <div className="relative">
                              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                className="pl-8 h-8 text-sm"
                                placeholder="Filter tasks…"
                                value={state?.search ?? ''}
                                onChange={(e) => setSearch(member._id, e.target.value)}
                              />
                            </div>

                            {/* Task list */}
                            {state?.loading ? (
                              <div className="flex justify-center py-6">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                              </div>
                            ) : filteredTasks.length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-4">
                                {(state?.tasks.length ?? 0) === 0
                                  ? 'No unfinished sprint tasks assigned to this member'
                                  : 'No tasks match the filter'}
                              </p>
                            ) : (
                              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                                {filteredTasks.map((task) => {
                                  const alreadyCommitted = committedIds.has(task._id)
                                  const selected = state?.selectedTaskIds.has(task._id)
                                  return (
                                    <button
                                      key={task._id}
                                      onClick={() => !alreadyCommitted && toggleTask(member._id, task._id)}
                                      disabled={alreadyCommitted}
                                      className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                                        alreadyCommitted
                                          ? 'bg-green-50 border border-green-200 cursor-default dark:bg-green-900/20 dark:border-green-800'
                                          : selected
                                          ? 'bg-primary/10 border border-primary/30'
                                          : 'bg-muted/40 border border-transparent hover:bg-muted/70'
                                      }`}
                                    >
                                      {alreadyCommitted ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                                      ) : selected ? (
                                        <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                                      ) : (
                                        <Square className="h-4 w-4 text-muted-foreground shrink-0" />
                                      )}
                                      <span className="flex-1 text-sm truncate">{task.title}</span>
                                      {alreadyCommitted && (
                                        <span className="text-xs text-green-600 dark:text-green-400 shrink-0">
                                          Saved
                                        </span>
                                      )}
                                      <Badge
                                        variant="outline"
                                        className={`text-xs px-1.5 py-0 shrink-0 ${priorityColors[task.priority] ?? ''}`}
                                      >
                                        {task.priority}
                                      </Badge>
                                    </button>
                                  )
                                })}
                              </div>
                            )}

                            {/* Save button */}
                            <div className="flex justify-end pt-1">
                              <Button
                                size="sm"
                                onClick={() => handleSaveCommitment(member._id)}
                                disabled={state?.saving || (state?.selectedTaskIds.size ?? 0) === 0}
                              >
                                {state?.saving && (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                )}
                                Add to Standup
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Committed members list */}
      {commitments.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {readOnly ? "Today's Commitments" : 'Committed So Far'}
          </p>
          {commitments.map((commitment) => {
            const member = commitment.user
            const memberName = `${member?.firstName ?? ''} ${member?.lastName ?? ''}`.trim()
            return (
              <MemberCommitmentRow
                key={commitment._id}
                commitment={commitment}
                onAddNote={(cId, note) => onAddNote(cId, note, memberName)}
                onResolveNote={onResolveNote}
                readOnly={readOnly}
              />
            )
          })}
        </div>
      )}

      {commitments.length === 0 && readOnly && (
        <div className="text-center py-10 border border-dashed rounded-lg">
          <ClipboardList className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground">
            No commitments were recorded for this session.
          </p>
        </div>
      )}
    </div>
  )
}
