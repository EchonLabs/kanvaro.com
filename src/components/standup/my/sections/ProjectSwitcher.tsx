'use client'

import { useRouter } from 'next/navigation'
import { Check, ChevronsUpDown } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/DropdownMenu'
import { standupStrings } from '@/lib/standup/strings'
import type { StandupCandidate } from '@/lib/standup/my-standup-candidates'

import { Tag, type TagTone } from '../shared/Tag'

export interface ProjectSwitcherProps {
  /** The stand-up currently on screen. Always rendered as the selected row. */
  currentStandupId: string
  currentProjectId?: string
  currentProjectName?: string
  /** Every open stand-up the viewer is expected at, the current one included. */
  candidates: readonly StandupCandidate[]
  locale?: string
}

/** Only `PRIORITY`'s three statuses reach the candidates list (see
 *  `my-standup-candidates.ts`); anything else is the current stand-up, which
 *  is unioned in below and can be in any status. */
const STATUS_TONE: Record<string, TagTone> = {
  In_Progress: 'blue',
  Ready: 'green',
  Scheduled: 'amber'
}

function formatLocalTime(iso: string, locale?: string): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
}

/**
 * Replaces the old collapsed "Also today" banner. A member holding a
 * sprint-team seat on more than one project has more than one stand-up open at
 * once, and the redirector only ever lands them on the highest-priority one —
 * the banner made the others findable but not obvious, and gave no standing
 * answer to "which project am I looking at". This is that control: the project
 * is the selector, and because the meeting link, pool and capacity all belong
 * to one project's stand-up, switching it switches all of them.
 *
 * Rendered as plain text rather than a menu when there is only one stand-up to
 * choose from — a dropdown with a single item is a control that does nothing.
 */
export function ProjectSwitcher({
  currentStandupId,
  currentProjectId,
  currentProjectName,
  candidates,
  locale
}: ProjectSwitcherProps) {
  const router = useRouter()

  // The current stand-up is normally in `candidates` already — same query, same
  // statuses — but not once it leaves them (Completed, Reopened, Missed). Union
  // it in so the trigger never shows a project the viewer is not on.
  const options = candidates.some((candidate) => candidate.standupId === currentStandupId)
    ? candidates
    : [
        ...(currentProjectId && currentProjectName
          ? [
              {
                standupId: currentStandupId,
                status: '',
                scheduledStartAt: '',
                projectId: currentProjectId,
                projectName: currentProjectName
              } satisfies StandupCandidate
            ]
          : []),
        ...candidates
      ]

  const selected = options.find((option) => option.standupId === currentStandupId)
  const label = selected?.projectName || currentProjectName

  if (!label) return null

  if (options.length < 2) {
    return <span className="truncate font-medium text-[var(--my-blue)]">{label}</span>
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={standupStrings.my.switchProject()}
          className="-mx-2 h-auto max-w-[16rem] gap-1.5 px-2 py-0.5 apple-type-subheadline font-medium text-[var(--my-blue)] hover:bg-[var(--my-blue-tint)]"
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-70" strokeWidth={2} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-72 rounded-[var(--apple-radius-md)] border-[var(--apple-separator)]"
      >
        <DropdownMenuLabel className="text-[length:var(--apple-font-footnote)] font-semibold text-[var(--apple-secondary-label)]">
          {standupStrings.my.switchProjectHint({ count: options.length })}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((option) => {
          const isSelected = option.standupId === currentStandupId
          return (
            <DropdownMenuItem
              key={option.standupId}
              aria-current={isSelected ? 'true' : undefined}
              onSelect={() => {
                if (!isSelected) router.push(`/my/standup/${option.standupId}`)
              }}
              className="flex items-center gap-2.5 rounded-[var(--apple-radius-sm)]"
            >
              <Check
                className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'opacity-100' : 'opacity-0'}`}
                strokeWidth={2.5}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate apple-type-subheadline font-medium">
                {option.projectName}
              </span>
              {option.scheduledStartAt ? (
                <span className="font-apple-mono shrink-0 tabular-nums apple-type-caption text-[var(--apple-secondary-label)]">
                  {formatLocalTime(option.scheduledStartAt, locale)}
                </span>
              ) : null}
              {option.status ? (
                <Tag tone={STATUS_TONE[option.status] ?? 'neutral'}>
                  {standupStrings.schedule.status[option.status] ?? option.status}
                </Tag>
              ) : null}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
