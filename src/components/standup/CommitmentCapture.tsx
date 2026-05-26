'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { CheckSquare, Square, Search, Loader2, UserCheck } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { useNotify } from '@/lib/notify'

interface SprintTask {
  _id: string
  title: string
  status: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  estimatedHours?: number
}

interface Member {
  _id: string
  firstName: string
  lastName: string
  avatar?: string
  role: string
}

interface CommitmentCaptureProps {
  sessionId: string
  projectId: string
  sprintId: string | null
  members: Member[]
  onCommitmentSaved: (userId: string, taskIds: string[]) => void
}

const priorityColors: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-100 text-blue-600',
  high: 'bg-orange-100 text-orange-600',
  critical: 'bg-red-100 text-red-600',
}

export function CommitmentCapture({
  sessionId,
  projectId,
  sprintId,
  members,
  onCommitmentSaved,
}: CommitmentCaptureProps) {
  const notify = useNotify()
  const [tasks, setTasks] = useState<SprintTask[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [savedMembers, setSavedMembers] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!projectId) return
    const fetchTasks = async () => {
      setLoadingTasks(true)
      try {
        const url = sprintId
          ? `/api/tasks?project=${projectId}&sprint=${sprintId}&status=todo,in_progress,review,testing`
          : `/api/tasks?project=${projectId}&status=todo,in_progress,review,testing`
        const res = await fetch(url)
        const data = await res.json()
        setTasks(data.tasks ?? [])
      } catch {
        notify.error({ title: 'Failed to load sprint tasks' })
      } finally {
        setLoadingTasks(false)
      }
    }
    fetchTasks()
  }, [projectId, sprintId])

  const handleMemberSelect = (member: Member) => {
    setSelectedMember(member)
    setSelectedTaskIds(new Set())
    setSearch('')
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
      const res = await fetch(`/api/standup/sessions/${sessionId}/commitments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedMember._id,
          taskIds: Array.from(selectedTaskIds),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save commitment')

      setSavedMembers((prev) => new Set(prev).add(selectedMember._id))
      onCommitmentSaved(selectedMember._id, Array.from(selectedTaskIds))
      setSelectedMember(null)
      setSelectedTaskIds(new Set())
      notify.success({ title: `Commitment saved for ${selectedMember.firstName}` })
    } catch (err: any) {
      notify.error({ title: err.message })
    } finally {
      setSaving(false)
    }
  }

  const filteredTasks = tasks.filter((t) =>
    t.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      {/* Member selector */}
      <div>
        <p className="text-sm font-medium mb-2">Select a team member</p>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <button
              key={m._id}
              onClick={() => handleMemberSelect(m)}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm border transition-all ${
                selectedMember?._id === m._id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border hover:border-primary/50'
              }`}
            >
              {savedMembers.has(m._id) && (
                <UserCheck className="h-3.5 w-3.5 text-green-400" />
              )}
              {m.firstName} {m.lastName}
            </button>
          ))}
        </div>
      </div>

      {/* Task selection for selected member */}
      {selectedMember && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium">
              Tasks for {selectedMember.firstName} {selectedMember.lastName}
              <span className="text-muted-foreground font-normal ml-1">
                ({selectedTaskIds.size} selected)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
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
              <p className="text-sm text-muted-foreground text-center py-4">No tasks found</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {filteredTasks.map((task) => (
                  <button
                    key={task._id}
                    onClick={() => toggleTask(task._id)}
                    className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                      selectedTaskIds.has(task._id)
                        ? 'bg-primary/10 border border-primary/30'
                        : 'bg-muted/40 border border-transparent hover:bg-muted/70'
                    }`}
                  >
                    {selectedTaskIds.has(task._id) ? (
                      <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="flex-1 text-sm truncate">{task.title}</span>
                    <Badge
                      variant="outline"
                      className={`text-xs px-1.5 py-0 ${priorityColors[task.priority]}`}
                    >
                      {task.priority}
                    </Badge>
                  </button>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSelectedMember(null); setSelectedTaskIds(new Set()) }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveCommitment}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                Save Commitment
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
