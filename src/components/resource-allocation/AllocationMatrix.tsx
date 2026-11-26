'use client'

import type { CSSProperties } from 'react'
import { Pencil, SlidersHorizontal, UserX } from 'lucide-react'

import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { cn } from '@/lib/utils'

import type { ActiveProject, SheetRow } from './api'
import { StatusChip } from './StatusChip'

interface Props {
  projects: ActiveProject[]
  rows: SheetRow[]
  threshold: number
  canEdit: boolean
  canApprove: boolean
  currentUserId?: string
  /** Index of the first row on this page, so numbering continues across pages. */
  rowOffset: number
  onManage(memberId: string): void
  onOpenRequest(requestId: string): void
}

/*
 * Layout: who (No, Role, Employee, Total) stays pinned on the left and the
 * outcome (Remaining, Approvals, Actions, Status) on the right, while the
 * project columns scroll between them. Pinning only applies on wide screens;
 * on a phone the whole table scrolls.
 *
 * Pinned columns get fixed widths, and each sticky offset is the sum of the
 * widths before it. Both come from the same numbers below, so a cell can never
 * be pinned on top of its neighbour.
 */
const LEFT = { no: 44, role: 120, employee: 216, total: 112 } as const
const RIGHT = { status: 148, actions: 104, approvals: 96, remaining: 96 } as const
const PROJECT_WIDTH = 136

const pin = 'lg:sticky lg:z-10 bg-card'
// Labels may wrap ("Total allocation" sits on two lines in the design) rather than spill into the next column.
const head = 'apple-section-label px-3 py-2 text-left align-bottom leading-tight'

function fixed(width: number, side: 'left' | 'right', offset: number): CSSProperties {
  return { width, minWidth: width, maxWidth: width, [side]: offset }
}

function splitName(name: string) {
  const [firstName, ...rest] = name.split(' ')
  return { firstName, lastName: rest.join(' ') }
}

export function AllocationMatrix({
  projects,
  rows,
  threshold,
  canEdit,
  canApprove,
  currentUserId,
  rowOffset,
  onManage,
  onOpenRequest
}: Props) {
  const left = {
    no: fixed(LEFT.no, 'left', 0),
    role: fixed(LEFT.role, 'left', LEFT.no),
    employee: fixed(LEFT.employee, 'left', LEFT.no + LEFT.role),
    total: fixed(LEFT.total, 'left', LEFT.no + LEFT.role + LEFT.employee)
  }
  const leftWidth = LEFT.no + LEFT.role + LEFT.employee + LEFT.total

  // Right side, from the outer edge inwards; hidden columns take no space.
  const actionsRight = RIGHT.status
  const approvalsRight = actionsRight + (canEdit ? RIGHT.actions : 0)
  const remainingRight = approvalsRight + (canApprove ? RIGHT.approvals : 0)
  const right = {
    status: fixed(RIGHT.status, 'right', 0),
    actions: fixed(RIGHT.actions, 'right', actionsRight),
    approvals: fixed(RIGHT.approvals, 'right', approvalsRight),
    remaining: fixed(RIGHT.remaining, 'right', remainingRight)
  }
  const rightColumns = 2 + (canEdit ? 1 : 0) + (canApprove ? 1 : 0)
  const rightWidth = remainingRight + RIGHT.remaining
  const columnCount = 4 + projects.length + rightColumns

  const leftEdge = 'border-r border-[var(--apple-separator)]'
  const rightEdge = 'border-l border-[var(--apple-separator)]'

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-[13px]">
        <thead>
          {/* Row 1: project names */}
          <tr className="border-b border-[var(--apple-separator)]">
            <th scope="row" colSpan={4} className={cn(head, pin, leftEdge, 'lg:left-0')} style={{ width: leftWidth, left: 0 }}>
              Project name
            </th>
            {projects.map((project) => (
              <th
                key={project._id}
                scope="col"
                className="px-3 py-2 text-left align-bottom"
                style={{ minWidth: PROJECT_WIDTH }}
              >
                <span className="block max-w-[180px] truncate text-[12px] font-semibold text-[var(--apple-label)]" title={project.name}>
                  {project.name}
                </span>
                <span
                  className={cn(
                    'mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                    project.billable
                      ? 'bg-[color-mix(in_srgb,var(--apple-system-blue)_12%,transparent)] text-[var(--apple-system-blue)]'
                      : 'bg-[var(--apple-tertiary-fill)] text-[var(--apple-secondary-label)]'
                  )}
                >
                  {project.billable ? 'Billable' : 'Non-billable'}
                </span>
              </th>
            ))}
            <th
              aria-hidden
              colSpan={rightColumns}
              rowSpan={2}
              className={cn(pin, rightEdge)}
              style={{ width: rightWidth, right: 0 }}
            />
          </tr>

          {/* Row 2: who runs each project */}
          <tr className="border-b border-[var(--apple-separator)]">
            <th scope="row" colSpan={4} className={cn(head, pin, leftEdge)} style={{ width: leftWidth, left: 0 }}>
              PM / BA
            </th>
            {projects.map((project) => (
              <th key={project._id} scope="col" className="px-3 py-2 text-left text-[12px] font-normal text-[var(--apple-secondary-label)]">
                {project.managers.length > 0 ? (
                  project.managers.map((manager) => (
                    <span key={manager._id} className="block max-w-[180px] truncate">
                      {manager.name}
                    </span>
                  ))
                ) : (
                  <span>No PM</span>
                )}
              </th>
            ))}
          </tr>

          {/* Row 3: column labels */}
          <tr className="border-b border-[var(--apple-separator)]">
            <th scope="col" data-pin="left" className={cn(head, pin)} style={left.no}>No</th>
            <th scope="col" data-pin="left" className={cn(head, pin)} style={left.role}>Role</th>
            <th scope="col" data-pin="left" className={cn(head, pin)} style={left.employee}>Employee</th>
            <th scope="col" data-pin="left" className={cn(head, pin, leftEdge)} style={left.total}>Total allocation</th>
            {projects.map((project) => (
              <th key={project._id} scope="col" className={head}>
                Allocation %
              </th>
            ))}
            {/* Single-word labels stay on one line; only multi-word ones may wrap. */}
            <th scope="col" className={cn(head, pin, rightEdge, 'whitespace-nowrap')} style={right.remaining}>Remaining</th>
            {canApprove && <th scope="col" className={cn(head, pin, 'whitespace-nowrap')} style={right.approvals}>Approvals</th>}
            {canEdit && <th scope="col" className={cn(head, pin, 'whitespace-nowrap')} style={right.actions}>Actions</th>}
            <th scope="col" className={cn(head, pin, 'whitespace-nowrap')} style={right.status}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columnCount} className="px-3 py-10 text-center text-[var(--apple-secondary-label)]">
                No resources match these filters.
              </td>
            </tr>
          )}
          {rows.map((row, index) => {
            const pending = row.pendingRequest
            const ownPending = !!pending && pending.requestedBy._id === currentUserId
            // A PM cannot raise a second request while one is pending; Admin/HR may still edit directly.
            const manageBlocked = !!pending && !canApprove
            const over = row.status === 'over'
            return (
              <tr
                key={row.memberId}
                data-status={row.status}
                className={cn(
                  'border-b border-[var(--apple-separator)] last:border-b-0',
                  // `--card` is an HSL triplet, so it has to be wrapped in hsl() to mix;
                  // the pinned cells must stay opaque or the scrolling columns show through.
                  over && '[&>td]:bg-[color-mix(in_srgb,var(--apple-system-red)_6%,hsl(var(--card)))]'
                )}
              >
                <td className={cn('px-3 py-3 tabular-nums text-[var(--apple-secondary-label)]', pin)} style={left.no}>
                  {rowOffset + index + 1}
                </td>
                <td className={cn('px-3 py-3', pin)} style={left.role}>
                  <span
                    title={row.roleLabel}
                    className="inline-block max-w-full truncate rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] px-2 py-0.5 text-[11px] text-[var(--apple-label)]"
                  >
                    {row.roleLabel}
                  </span>
                </td>
                <td className={cn('px-3 py-3', pin)} style={left.employee}>
                  <div className="flex items-center gap-2.5">
                    <GravatarAvatar user={{ ...splitName(row.name), email: row.email, avatar: row.avatar }} size={30} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[var(--apple-label)]">{row.name}</p>
                      <p className="truncate text-[11px] text-[var(--apple-secondary-label)]">{row.email}</p>
                    </div>
                  </div>
                </td>
                <td className={cn('px-3 py-3', pin, leftEdge)} style={left.total}>
                  <span className={cn('font-semibold tabular-nums', row.total > threshold && 'text-[var(--apple-system-red)]')}>
                    {row.total}%
                  </span>
                  <span aria-hidden className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-[var(--apple-tertiary-fill)]">
                    <span
                      className={cn(
                        'block h-full rounded-full',
                        row.total > threshold ? 'bg-[var(--apple-system-red)]' : 'bg-[var(--apple-system-blue)]'
                      )}
                      style={{ width: `${Math.min(100, row.total)}%` }}
                    />
                  </span>
                </td>
                {projects.map((project) => {
                  const cell = row.cells[project._id]
                  return (
                    <td key={project._id} className="px-3 py-3 tabular-nums">
                      {cell ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-[var(--apple-system-blue)]">
                          {cell.percent}%
                          {!cell.onTeam && (
                            <span
                              role="img"
                              aria-label={`Not on team: ${row.name} is no longer a member of ${project.name}`}
                              title="Not on team — allocated but no longer a member of this project"
                              className="text-[var(--apple-system-orange)]"
                            >
                              <UserX className="h-3.5 w-3.5" strokeWidth={2} />
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[var(--apple-tertiary-label)]">—</span>
                      )}
                    </td>
                  )
                })}
                <td
                  className={cn('px-3 py-3 font-semibold tabular-nums text-[var(--apple-system-green)]', pin, rightEdge)}
                  style={right.remaining}
                >
                  {row.remaining}%
                </td>
                {canApprove && (
                  <td className={cn('px-3 py-3', pin)} style={right.approvals}>
                    {pending ? (
                      <button
                        type="button"
                        onClick={() => onOpenRequest(pending.id)}
                        aria-label={`Review request for ${row.name}`}
                        title={`Requested by ${pending.requestedBy.name}`}
                        className="rounded-[var(--apple-radius-sm)] p-1.5 text-[var(--apple-label)] hover:bg-[var(--apple-quaternary-fill)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-system-blue)]"
                      >
                        <Pencil className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    ) : (
                      <span className="text-[12px] text-[var(--apple-tertiary-label)]">N/A</span>
                    )}
                  </td>
                )}
                {canEdit && (
                  <td className={cn('px-3 py-3', pin)} style={right.actions}>
                    {ownPending && !canApprove ? (
                      <button
                        type="button"
                        onClick={() => onOpenRequest(pending!.id)}
                        aria-label={`View request for ${row.name}`}
                        className="mb-1 block rounded-sm text-[12px] font-medium text-[var(--apple-system-blue)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-system-blue)]"
                      >
                        View request
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onManage(row.memberId)}
                      disabled={manageBlocked}
                      aria-label={`Manage allocation for ${row.name}`}
                      title={manageBlocked ? 'A request for this person is already awaiting approval' : undefined}
                      className="inline-flex items-center gap-1.5 rounded-[var(--apple-radius-sm)] px-2 py-1 text-[12px] font-medium text-[var(--apple-label)] hover:bg-[var(--apple-quaternary-fill)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-system-blue)]"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Manage
                    </button>
                  </td>
                )}
                <td className={cn('px-3 py-3', pin)} style={right.status}>
                  <StatusChip status={row.status} pending={!!pending} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
