'use client'

import { useState } from 'react'
import { FolderOpen } from 'lucide-react'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/**
 * Person → project, the visual that opens the review and approval steps in the design.
 * Shows the member's uploaded photo when there is one, otherwise (or if it fails to load) their initials.
 */
export function ChangeHeader({ memberName, avatar }: { memberName: string; avatar?: string }) {
  const [photoFailed, setPhotoFailed] = useState(false)
  const showPhoto = Boolean(avatar) && !photoFailed

  return (
    <div data-testid="change-header" className="flex items-center justify-center gap-2 pb-1" aria-hidden>
      <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[var(--apple-tertiary-fill)] text-[13px] font-semibold text-[var(--apple-label)] ring-2 ring-[var(--apple-separator)]">
        {showPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- decorative, same-origin upload
          <img src={avatar} alt="" className="h-full w-full object-cover" onError={() => setPhotoFailed(true)} />
        ) : (
          initials(memberName)
        )}
      </span>
      <span className="w-10 border-t-2 border-dashed border-[var(--apple-separator)]" />
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--apple-system-blue)_14%,transparent)] text-[var(--apple-system-blue)]">
        <FolderOpen className="h-5 w-5" strokeWidth={1.75} />
      </span>
    </div>
  )
}

/** The two-letter tile beside a project name, e.g. "AV" for AVO, "Ba" for BaseNeo SaaS. */
export function ProjectTile({ name }: { name: string }) {
  const letters = name.trim().slice(0, 2)
  return (
    <span
      aria-hidden="true"
      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[6px] bg-[color-mix(in_srgb,var(--apple-system-blue)_12%,transparent)] text-[10px] font-semibold text-[var(--apple-system-blue)]"
    >
      {letters.charAt(0).toUpperCase() + letters.slice(1)}
    </span>
  )
}
