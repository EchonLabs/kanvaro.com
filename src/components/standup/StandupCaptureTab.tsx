'use client'

import { useState } from 'react'
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
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [tasks, setTasks] = useState<SprintTask[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const projectId = session.project?._id ?? session.project
  const sprintId = session.sprint

  const getCommittedTaskIds = (userId: string): Set<string> => {
    const commitment = commitments.find(
      (c) => (c.user?._id ?? c.user) === userId
    )
    if (!commitment) return new Set()
    return new Set(commitment.tasks?.map((t: any) => t.task?._id ?? t.task) ?? [])
  }

  const handleMemberSelect = async (member: Member) => {
    if (selectedMember?._id === member._id) {
      setSelectedMember(null)
      setTasks([])
      setSelectedTaskIds(new Set())
      return
    }
    setSelectedMember(member)
    setSelectedTaskIds(new Set())
    setSearch('')
    setLoadingTasks(true)
    try {
      const sprintPart = sprintId ? `&sprint=${sprintId}` : ''
      const url = `/api/tasks?project=${projectId}&assignedTo=${member._id}${sprintPart}&status=todo,in_progress,review,testing`
      const res = await fetch(url)
      const data = await res.json()
      setTasks(data.tasks ?? [])
    } catch {
      notify.error({ title: 'Failed to load tasks' })
    } finally {
      setLoadingTasks(false)
    }
  }

  const toggleTask = (taskId: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev)
      next.has(taskId) ? next.delete(taskId) : next.add(taskId)
      return next
    })
  }

  const handleSaveCommitment = async () => {
    if (!selectedMember) return
    setSaving(true)
    try {
      const existingIds = getCommittedTaskIds(selectedMember._id)
      const merged = new Set(Array.from(existingIds).concat(Array.from(selectedTaskIds)))
      const allTaskIds = Array.from(merged)

      const res = await fetch(`/api/standup/sessions/${session._id}/commitments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedMember._id, taskIds: allTaskIds }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      notify.success({ title: `Commitment saved for ${selectedMember.firstName}` })
      setSelectedMember(null)
      setTasks([])
      setSelectedTaskIds(new Set())
      onCommitmentSaved()
    } catch (err: any) {
      notify.error({ title: err.message })
    } finally {
      setSaving(false)
    }
  }

  const filteredTasks = tasks.filter((t) =>
    t.title.toLowerCase().includes(search.toLowerCase())
  )

  const committedMemberIds = new Set(commitments.map((c) => c.user?._id ?? c.user))

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
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Today&apos;s Commitments
          </p>

          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No team members found for this project.</p>
          ) : (
            <>
              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  Select a team member to assign their tasks
                </p>
                <div className="flex flex-wrap gap-2">
                  {members.map((m) => (
                    <button
                      key={m._id}
                      onClick={() => handleMemberSelect(m)}
                      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm border transition-all ${
                        selectedMember?._id === m._id
                          ? 'bg-primary text-primary-foreground border-primary'
                          : committedMemberIds.has(m._id)
                          ? 'bg-green-50 border-green-300 text-green-700 dark:bg-green-900/20 dark:border-green-700 dark:text-green-400'
                          : 'bg-card border-border hover:border-primary/50'
                      }`}
                    >
                      {committedMemberIds.has(m._id) && (
                        <UserCheck className="h-3.5 w-3.5" />
                      )}
                      {m.firstName} {m.lastName}
                    </button>
                  ))}
                </div>
              </div>

              {/* Task panel */}
              {selectedMember && (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">
                        {selectedMember.firstName}&apos;s sprint tasks
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {selectedTaskIds.size} selected
                      </span>
                    </div>

                    <div className="relative">
                      <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="pl-8 h-8 text-sm"
                        placeholder="Search tasks…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>

                    {loadingTasks ? (
                      <div className="flex justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : filteredTasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No unfinished sprint tasks assigned to this member
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-72 overflow-y-auto">
                        {filteredTasks.map((task) => {
                          const alreadyCommitted = getCommittedTaskIds(selectedMember._id).has(
                            task._id
                          )
                          const selected = selectedTaskIds.has(task._id)
                          return (
                            <button
                              key={task._id}
                              onClick={() => !alreadyCommitted && toggleTask(task._id)}
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
                                  In standup
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

                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedMember(null)
                          setTasks([])
                          setSelectedTaskIds(new Set())
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveCommitment}
                        disabled={saving || selectedTaskIds.size === 0}
                      >
                        {saving && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        )}
                        Add to Standup
                      </Button>
                    </div>
                  </CardContent>
                </Card>
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
            const memberName =
              `${member?.firstName ?? ''} ${member?.lastName ?? ''}`.trim()
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
