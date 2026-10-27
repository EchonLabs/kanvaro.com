'use client'

import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/Button'

/**
 * The save control for the stand-up settings forms.
 *
 * Replaces the per-tab header button, which sat above seven scrolling sections:
 * you changed Ceremonies near the bottom, then scrolled back up to a control
 * you could no longer see. The action belongs wherever the editing is, so this
 * anchors to the bottom of the viewport instead.
 *
 * It renders **only when the form is dirty**, which does three jobs at once.
 * The bar's presence is the unsaved-changes indicator, so no separate badge is
 * needed. A clean form gets its full width back rather than carrying a
 * permanently disabled button. And the same `dirty` flag the bar keys off is
 * what lets the panel guard a tab switch — before, changing segment unmounted
 * the form and discarded the edits with no prompt at all.
 *
 * Deliberately plain: this is furniture on a settings screen. It matches the
 * app's existing glass header treatment rather than introducing a look of its
 * own.
 */
export function SettingsActionBar({
  dirty,
  saving,
  onSave,
  onDiscard,
  saveLabel
}: {
  dirty: boolean
  saving: boolean
  onSave: () => void
  onDiscard: () => void
  /** Names the thing being saved, e.g. "Save settings". Active voice, matching the toast that follows. */
  saveLabel: string
}) {
  if (!dirty) return null

  return (
    <div
      // `sticky` rather than `fixed` so the bar stays inside the settings
      // panel's column and cannot overlap the app chrome on narrow viewports.
      className="apple-glass sticky bottom-0 z-20 -mx-1 mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--apple-separator)] px-4 py-3"
    >
      <p
        className="text-[13px] text-[var(--apple-secondary-label)]"
        // Announced when the bar appears, so a screen-reader user learns there
        // is something to save without having to tab to the end of the form.
        role="status"
      >
        You have unsaved changes.
      </p>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onDiscard} disabled={saving}>
          Discard
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {saveLabel}
        </Button>
      </div>
    </div>
  )
}
