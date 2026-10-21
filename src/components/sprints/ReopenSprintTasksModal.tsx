'use client'

import { useState, useMemo, useCallback } from 'react'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/Badge'
import { Checkbox } from '@/components/ui/Checkbox'
import { useNotify } from '@/lib/notify'
import { RotateCcw, Loader2, ArrowRight, Search, FileText } from 'lucide-react'

interface SprintTask {
  _id: string
  title: string
  displayId?: string
  status: string
  priority?: string
  archived?: boolean
  movedToSprint?: { _id: string; name: string } | null
  movedToBacklog?: boolean
}

interface ReopenSprintTasksModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sprint: { _id: string; name: string; project?: { _id: string; name: string } }
  tasks: SprintTask[]
  availableSprints: Array<{ _id: string; name: string; status: string }>
  projectStatusOptions: Array<{ value: string; label: string }>
  onSuccess: () => Promise<void>
}

export function ReopenSprintTasksModal({
  open,
  onOpenChange,
  sprint,
  tasks,
  availableSprints,
  projectStatusOptions,
  onSuccess
}: ReopenSprintTasksModalProps) {
  const { success: notifySuccess, error: notifyError } = useNotify()

  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [pastedKeys, setPastedKeys] = useState('')
  const [pasteFeedback, setPasteFeedback] = useState<string | null>(null)
  const [showPasteBox, setShowPasteBox] = useState(false)
  const [destination, setDestination] = useState<'backlog' | 'sprint'>('backlog')
  const [targetSprintId, setTargetSprintId] = useState('')
  const [targetStatus, setTargetStatus] = useState('todo')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isAlreadyMoved = useCallback((t: SprintTask) => Boolean(t.movedToSprint || t.movedToBacklog), [])
  const eligibleTasks = useMemo(() => tasks.filter(t => !isAlreadyMoved(t)), [tasks, isAlreadyMoved])

  const getStatusLabel = useCallback((status: string) => {
    const opt = projectStatusOptions.find(p => p.value === status)
    return opt?.label || status.replace(/_/g, ' ')
  }, [projectStatusOptions])

  // Filter tasks by search query
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks
    const q = searchQuery.trim().toLowerCase()
    return tasks.filter(t => (t.title || '').toLowerCase().includes(q) || (t.displayId || '').toLowerCase().includes(q))
  }, [tasks, searchQuery])

  const eligibleFiltered = useMemo(() => filteredTasks.filter(t => !isAlreadyMoved(t)), [filteredTasks, isAlreadyMoved])

  const toggleTask = useCallback((task: SprintTask) => {
    if (isAlreadyMoved(task)) return // Disallow selecting already moved tasks
    setSelectedTaskIds(p => {
      const s = new Set(p)
      s.has(task._id) ? s.delete(task._id) : s.add(task._id)
      return s
    })
  }, [isAlreadyMoved])

  const toggleAllFiltered = useCallback(() => {
    const allSelected = eligibleFiltered.length > 0 && eligibleFiltered.every(t => selectedTaskIds.has(t._id))
    setSelectedTaskIds(p => {
      const s = new Set(p)
      eligibleFiltered.forEach(t => allSelected ? s.delete(t._id) : s.add(t._id))
      return s
    })
  }, [eligibleFiltered, selectedTaskIds])

  // Select tasks matching pasted IDs/keys (ignoring already moved tasks)
  const handleApplyPasted = useCallback(() => {
    const tokens = new Set(pastedKeys.split(/[\s,;\n\r]+/).map(t => t.trim().toLowerCase()).filter(Boolean))
    if (!tokens.size) return

    let count = 0
    setSelectedTaskIds(p => {
      const s = new Set(p)
      tasks.filter(t => !isAlreadyMoved(t)).forEach(t => {
        const matches = (t._id && tokens.has(t._id.toLowerCase())) ||
          (t.displayId && (tokens.has(t.displayId.toLowerCase()) || tokens.has(t.displayId.replace(/\D/g, ''))))
        if (matches) { s.add(t._id); count++ }
      })
      return s
    })
    setPasteFeedback(`Selected ${count} matching tasks`)
  }, [pastedKeys, tasks, isAlreadyMoved])

  const handleExecute = async () => {
    if (!selectedTaskIds.size) return notifyError({ title: 'Please select at least one task' })
    if (destination === 'sprint' && !targetSprintId) return notifyError({ title: 'Please select a target sprint' })

    try {
      setIsSubmitting(true)
      const taskIds = Array.from(selectedTaskIds)
      const updates = {
        archived: false,
        status: destination === 'backlog' ? 'backlog' : targetStatus,
        sprint: destination === 'sprint' ? targetSprintId : null,
        completedAt: null,
        ...(destination === 'backlog' ? { movedFromSprint: sprint._id } : {})
      }

      const res = await fetch('/api/tasks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', taskIds, updates })
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Update failed')

      if (destination === 'sprint' && targetSprintId) {
        const sRes = await fetch(`/api/sprints/${targetSprintId}`)
        const sData = await sRes.json()
        const existing = (sData.data?.tasks || []).map((t: any) => typeof t === 'string' ? t : t._id)
        await fetch(`/api/sprints/${targetSprintId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tasks: Array.from(new Set([...existing, ...taskIds])) })
        }).catch(err => console.warn('Sprint sync:', err))
      }

      notifySuccess({ title: 'Tasks Updated', message: `${taskIds.length} tasks were reopened and moved.` })
      onOpenChange(false)
      setSelectedTaskIds(new Set())
      await onSuccess()
    } catch (err) {
      notifyError({ title: 'Update Failed', message: err instanceof Error ? err.message : 'Error' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const allFilteredSelected = eligibleFiltered.length > 0 && eligibleFiltered.every(t => selectedTaskIds.has(t._id))
  const otherSprints = availableSprints.filter(s => s._id !== sprint._id)

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={o => { if (!o) { setSelectedTaskIds(new Set()); setSearchQuery('') }; onOpenChange(o) }}
      title="Reopen & Move Sprint Tasks"
      description={`Select tasks from "${sprint.name}" to move.`}
      className="max-w-xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-muted-foreground">
            <strong className="text-foreground">{selectedTaskIds.size}</strong> of {eligibleTasks.length} available selected
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
            <Button onClick={handleExecute} disabled={isSubmitting || !selectedTaskIds.size}>
              {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Updating…</> : <><RotateCcw className="h-4 w-4 mr-2" />Reopen & Move ({selectedTaskIds.size})</>}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3 py-1 pr-1">
        {/* Destination & Status */}
        <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border bg-muted/20 text-xs">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <ArrowRight className="h-3 w-3 text-primary" /> Destination
            </Label>
            <div className="grid grid-cols-2 gap-1.5">
              {(['backlog', 'sprint'] as const).map(dest => (
                <button
                  key={dest}
                  type="button"
                  onClick={() => { setDestination(dest); if (dest === 'sprint' && targetStatus === 'backlog') setTargetStatus('todo') }}
                  className={`py-1.5 px-2 rounded-md border capitalize font-medium transition-all ${destination === dest ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted/50'}`}
                >
                  {dest === 'sprint' ? 'Target Sprint' : 'Backlog'}
                </button>
              ))}
            </div>
            {destination === 'sprint' && (
              <Select value={targetSprintId} onValueChange={setTargetSprintId}>
                <SelectTrigger className="h-8 text-xs mt-1.5"><SelectValue placeholder="Choose target sprint…" /></SelectTrigger>
                <SelectContent className="z-[10050] max-h-60 overflow-y-auto">
                  {otherSprints.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                      No active or planning sprints found
                    </div>
                  ) : (
                    otherSprints.map(s => <SelectItem key={s._id} value={s._id}>{s.name} ({s.status})</SelectItem>)
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Status</Label>
            {destination === 'sprint' ? (
              <Select value={targetStatus} onValueChange={setTargetStatus}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent className="z-[10050] max-h-60 overflow-y-auto">
                  {projectStatusOptions
                    .filter(opt => opt.value !== 'backlog')
                    .map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="h-8 px-3 flex items-center rounded-md border border-border bg-muted/40 text-muted-foreground font-medium">
                Backlog
              </div>
            )}
          </div>
        </div>

        {/* Paste Tool */}
        <div className="rounded-lg border bg-card p-2.5 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setShowPasteBox(!showPasteBox)} className="text-primary hover:underline flex items-center gap-1 font-medium">
              <FileText className="h-3 w-3" /> {showPasteBox ? 'Hide Paste Tool' : 'Paste Task Keys / IDs'}
            </button>
            {pasteFeedback && <span className="text-[11px] text-green-600 dark:text-green-400">{pasteFeedback}</span>}
          </div>
          {showPasteBox && (
            <div className="space-y-1.5 pt-1 border-t">
              <textarea
                value={pastedKeys}
                onChange={e => setPastedKeys(e.target.value)}
                placeholder="KAN-101, KAN-102&#10;or one ID per line"
                rows={2}
                className="w-full text-xs font-mono p-2 rounded border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex justify-end">
                <Button type="button" variant="outline" size="sm" onClick={handleApplyPasted} disabled={!pastedKeys.trim()} className="h-7 text-xs">
                  Select Pasted
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Search Bar & Multi-Select Toggle */}
        <div className="flex gap-2 items-center justify-between">
          <div className="relative flex-1">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search tasks by title or #ID…" className="pl-8 h-8 text-xs" />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={toggleAllFiltered} className="h-8 text-xs px-2.5 flex-shrink-0">
            {allFilteredSelected ? 'Deselect All' : `Select All (${eligibleFiltered.length})`}
          </Button>
        </div>

        {/* Task List */}
        <div className="border rounded-lg bg-card max-h-56 overflow-y-auto divide-y">
          {!filteredTasks.length ? (
            <div className="p-5 text-center text-xs text-muted-foreground">No tasks match your search.</div>
          ) : (
            filteredTasks.map(task => {
              const alreadyMoved = isAlreadyMoved(task)
              const checked = selectedTaskIds.has(task._id)
              return (
                <div
                  key={task._id}
                  onClick={() => !alreadyMoved && toggleTask(task)}
                  className={`flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                    alreadyMoved
                      ? 'opacity-50 cursor-not-allowed bg-muted/20'
                      : checked
                      ? 'cursor-pointer bg-primary/5 hover:bg-muted/40'
                      : 'cursor-pointer hover:bg-muted/40'
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    disabled={alreadyMoved}
                    onCheckedChange={() => !alreadyMoved && toggleTask(task)}
                    onClick={e => e.stopPropagation()}
                  />
                  {task.displayId && <span className="font-mono text-[11px] font-semibold px-1 rounded border text-muted-foreground flex-shrink-0">#{task.displayId}</span>}
                  <span className="flex-1 truncate font-medium text-foreground" title={task.title}>{task.title || 'Untitled Task'}</span>
                  {alreadyMoved ? (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-400 flex-shrink-0">
                      {task.movedToSprint ? `Moved to ${task.movedToSprint.name}` : 'Moved to Backlog'}
                    </span>
                  ) : (
                    <Badge variant="outline" className="text-[10px] capitalize h-5 px-1.5 flex-shrink-0">
                      {getStatusLabel(task.status)}
                    </Badge>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </ResponsiveDialog>
  )
}
