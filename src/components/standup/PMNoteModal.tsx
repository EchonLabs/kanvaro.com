'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/Input'

interface PMNote {
  content: string
  blocker: string | null
  targetResolution: string | null
  resolved: boolean
  createdAt: string
}

interface PMNoteModalProps {
  open: boolean
  commitmentId: string | null
  existingNote: PMNote | null
  memberName: string
  onClose: () => void
  onSave: (commitmentId: string, data: { content: string; blocker?: string; targetResolution?: string }) => Promise<void>
}

export function PMNoteModal({
  open,
  commitmentId,
  existingNote,
  memberName,
  onClose,
  onSave,
}: PMNoteModalProps) {
  const [content, setContent] = useState(existingNote?.content ?? '')
  const [blocker, setBlocker] = useState(existingNote?.blocker ?? '')
  const [targetResolution, setTargetResolution] = useState(
    existingNote?.targetResolution
      ? new Date(existingNote.targetResolution).toISOString().split('T')[0]
      : ''
  )
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!commitmentId || !content.trim()) return
    setSaving(true)
    try {
      await onSave(commitmentId, {
        content: content.trim(),
        blocker: blocker.trim() || undefined,
        targetResolution: targetResolution || undefined,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose() }}
      title={existingNote ? 'Edit PM Note' : 'Add PM Note'}
      description={`Note for ${memberName}`}
    >
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="note-content">Note *</Label>
          <Textarea
            id="note-content"
            placeholder="e.g. Blocked — waiting on client API credentials — target resolution: Wednesday EOD"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            maxLength={2000}
          />
          <p className="text-xs text-muted-foreground text-right">{content.length}/2000</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="note-blocker">Blocker (optional)</Label>
          <Input
            id="note-blocker"
            placeholder="e.g. Missing API credentials from client"
            value={blocker}
            onChange={(e) => setBlocker(e.target.value)}
            maxLength={500}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="note-resolution">Target Resolution Date (optional)</Label>
          <Input
            id="note-resolution"
            type="date"
            value={targetResolution}
            onChange={(e) => setTargetResolution(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!content.trim() || saving}>
            {saving ? 'Saving…' : 'Save Note'}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  )
}
