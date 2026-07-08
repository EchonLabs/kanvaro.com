'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { Loader2, Search, User } from 'lucide-react'

interface Member {
  _id: string
  firstName: string
  lastName: string
  email: string
  avatar?: string
}

interface MemberPickerDialogProps {
  open: boolean
  onClose: () => void
  onSelect: (member: Member) => void
  projectId: string
  title?: string
  description?: string
}

export function MemberPickerDialog({
  open,
  onClose,
  onSelect,
  projectId,
  title = 'Select Member',
  description = 'Choose a project member',
}: MemberPickerDialogProps) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) {
      setSearch('')
      return
    }

    const fetchMembers = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/projects/${projectId}/team`)
        if (!res.ok) return
        const data = await res.json()
        const raw: Member[] = Array.isArray(data?.data?.teamMembers) ? data.data.teamMembers : []
        setMembers(raw)
      } catch {
        setMembers([])
      } finally {
        setLoading(false)
      }
    }

    void fetchMembers()
  }, [open, projectId])

  const filtered = members.filter((m) => {
    const q = search.toLowerCase()
    return (
      m.firstName.toLowerCase().includes(q) ||
      m.lastName.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q)
    )
  })

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="border-b border-border/50 bg-muted/20">
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <User className="h-4 w-4" />
            </div>
            {title}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground ml-10">{description}</DialogDescription>
        </DialogHeader>

        <div className="p-4 border-b border-border/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">No members found.</p>
          ) : (
            <ul>
              {filtered.map((member) => (
                <li key={member._id}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                    onClick={() => {
                      onSelect(member)
                      onClose()
                    }}
                  >
                    <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {member.firstName[0]}{member.lastName[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{member.firstName} {member.lastName}</p>
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
