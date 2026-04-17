'use client'

import { useEffect, useMemo, useState } from 'react'
import { Play } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/Dialog'
import { useNotify } from '@/lib/notify'

type EntityRef = {
  id: string
  name: string
}

type TaskRef = {
  id: string
  title: string
}

interface StartTimerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  organizationId: string
  project: EntityRef
  task: TaskRef
  onStarted?: (activeTimer: any) => void
}

export function StartTimerModal({
  open,
  onOpenChange,
  userId,
  organizationId,
  project,
  task,
  onStarted
}: StartTimerModalProps) {
  const { success: notifySuccess, error: notifyError } = useNotify()
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const initialMemo = useMemo(() => task.title || '', [task.title])

  useEffect(() => {
    if (!open) return
    setMemo(initialMemo)
    setError('')
    setSubmitting(false)
  }, [open, initialMemo])

  const canSubmit = !!userId && !!organizationId && !!project.id && !!task.id && !submitting

  const handleStart = async () => {
    if (!canSubmit) return

    setSubmitting(true)
    setError('')

    try {
      const response = await fetch('/api/time-tracking/timer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          organizationId,
          projectId: project.id,
          taskId: task.id,
          description: memo
        })
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        const message = data?.error || 'Failed to start timer'
        setError(message)
        notifyError({ title: message })
        return
      }

      onStarted?.(data?.activeTimer)
      notifySuccess({ title: 'Timer started' })
      onOpenChange(false)
    } catch (e) {
      const message = 'Failed to start timer'
      setError(message)
      notifyError({ title: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start Timer</DialogTitle>
          <DialogDescription>Start a new timer for this task.</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1">
            <Label>Project</Label>
            <div className="text-sm text-muted-foreground">{project.name}</div>
          </div>

          <div className="space-y-1">
            <Label>Task</Label>
            <div className="text-sm text-muted-foreground">{task.title}</div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="start-timer-memo">Memo</Label>
            <Textarea
              id="start-timer-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Add a memo (optional)"
              rows={4}
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleStart} disabled={!canSubmit}>
            <Play className="h-4 w-4 mr-2" />
            Start Timer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
