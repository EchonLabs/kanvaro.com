'use client'

import { useId, useMemo, useRef, useState } from 'react'

import { fitsIndicator } from '@/lib/standup/allocation'
import { formatMinutesAsHours, type Minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

/**
 * The keyboard path to allocation (§15.8.7 "Quick add", NFR-A2/A4).
 *
 * **This is not a convenience.** HTML drag-and-drop has no keyboard equivalent,
 * so for anybody not using a pointer this combobox *is* how work gets onto the
 * board. It ships in the same task as the drop zone rather than after it,
 * because a board that can only be filled by dragging is a board part of the
 * team cannot use — and that is discovered at the accessibility audit, three
 * phases too late to be cheap.
 *
 * Implemented against the ARIA combobox pattern by hand rather than through the
 * `Command` component, because the option rows carry ALO-17's fit indicator and
 * have to remain part of the option's accessible name — a PM scanning by
 * keyboard needs to hear "Export CSV, 5.0h, fits exactly", not just the title.
 */

export interface QuickAddTask {
  taskId: string
  key?: string
  title: string
  remainingEstimateMinutes: Minutes
}

export interface QuickAddComboboxProps {
  memberName: string
  tasks: readonly QuickAddTask[]
  /** The member's remaining gap, for the ALO-17 fit indicator. */
  gapMinutes: Minutes
  onSelect: (task: QuickAddTask) => void
  disabled?: boolean
  locale?: string
  className?: string
}

export function QuickAddCombobox({
  memberName,
  tasks,
  gapMinutes,
  onSelect,
  disabled = false,
  locale,
  className
}: QuickAddComboboxProps) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return tasks
    return tasks.filter((task) =>
      `${task.key ?? ''} ${task.title}`.toLowerCase().includes(needle)
    )
  }, [tasks, query])

  const close = () => {
    setOpen(false)
    setActiveIndex(-1)
  }

  const choose = (task: QuickAddTask) => {
    onSelect(task)
    // Cleared rather than left holding the last search: the PM is usually
    // placing several tasks in a row, and a stale query hides the next one.
    setQuery('')
    close()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (matches.length === 0) return
      setOpen(true)
      setActiveIndex((current) => {
        const delta = event.key === 'ArrowDown' ? 1 : -1
        const next = current + delta
        if (next < 0) return matches.length - 1
        return next % matches.length
      })
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      // Enter with nothing highlighted must do nothing. Falling back to the
      // first match would allocate a task the PM never looked at.
      const task = matches[activeIndex]
      if (task) choose(task)
    }
  }

  const activeId = activeIndex >= 0 && matches[activeIndex]
    ? `${listId}-option-${matches[activeIndex].taskId}`
    : undefined

  return (
    <div className={cn('relative flex flex-col gap-1', className)}>
      <input
        ref={inputRef}
        role="combobox"
        type="text"
        value={query}
        disabled={disabled}
        aria-label={standupStrings.allocation.quickAddLabel({ name: memberName })}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        placeholder={standupStrings.allocation.quickAddPlaceholder()}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
          setActiveIndex(-1)
        }}
        onKeyDown={onKeyDown}
        className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm disabled:opacity-40"
      />

      {open && (
        <div className="absolute top-full z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          {matches.length === 0 ? (
            <p className="px-2 py-2 text-sm text-muted-foreground">
              {standupStrings.allocation.quickAddEmpty()}
            </p>
          ) : (
            <ul id={listId} role="listbox" className="max-h-64 overflow-y-auto py-1">
              {matches.map((task, index) => (
                <li
                  key={task.taskId}
                  id={`${listId}-option-${task.taskId}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(event) => {
                    // `mousedown`, not `click`: the input would blur first and
                    // close the list before the click ever landed.
                    event.preventDefault()
                    choose(task)
                  }}
                  className={cn(
                    'flex cursor-pointer items-baseline justify-between gap-2 px-2 py-1 text-sm',
                    index === activeIndex && 'bg-accent'
                  )}
                >
                  <span className="truncate">
                    {task.key ? `${task.key} ` : ''}
                    {task.title}
                  </span>
                  <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                    {formatMinutesAsHours(task.remainingEstimateMinutes, { locale })}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {fitLabel(task.remainingEstimateMinutes, gapMinutes, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-border px-2 py-1 text-xs text-muted-foreground">
            {standupStrings.allocation.quickAddHint()}
          </p>
        </div>
      )}
    </div>
  )
}

/** ALO-17, as a word rather than a colour. */
function fitLabel(remaining: Minutes, gapMinutes: Minutes, locale?: string): string {
  switch (fitsIndicator(remaining, gapMinutes)) {
    case 'exact':
      return standupStrings.allocation.fitsExact()
    case 'fits':
      return standupStrings.allocation.fitsUnder({
        minutes: (gapMinutes - remaining) as Minutes,
        locale
      })
    case 'overflows':
      return standupStrings.allocation.fitsOver({
        minutes: Math.max(0, remaining - gapMinutes) as Minutes,
        locale
      })
  }
}
