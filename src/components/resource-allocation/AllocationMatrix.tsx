'use client'

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
 * project columns scroll between them — the sheet can grow to many projects
 * without losing track of whose row you are reading. Pinning only applies on
 * wide screens; on a phone the whole table scrolls.
 */
const pinLeft = 'lg:sticky lg:z-10 bg-card'
const pinRight = 'lg:sticky lg:z-10 bg-card'
const headCell = 'px-3 py-2 text-left text-[11px] font-semibold text-[var(--apple-secondary-label)] whitespace-nowrap'

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
  // Right-hand pinned offsets, from the outer edge inwards.
  const statusRight = 0
  const actionsRight = 152
  const approvalsRight = actionsRight + (canEdit ? 120 : 0)
  const remainingRight = approvalsRight + (canApprove ? 96 : 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[var(--apple-separator)]">
            <th rowSpan={2} scope="col" className={cn(headCell, pinLeft, 'w-12 lg:left-0')}>
              No
            </th>
            <th rowSpan={2} scope="col" className={cn(headCell, pinLeft, 'w-36 lg:left-12')}>
              Role
            </th>
            <th rowSpan={2} scope="col" className={cn(headCell, pinLeft, 'w-60 lg:left-48')}>
              Employee
            </th>
            <th
              rowSpan={2}
              scope="col"
              className={cn(headCell, pinLeft, 'w-32 border-r border-[var(--apple-separator)] lg:left-[432px]')}
            >
              Total allocation
            </th>
            {projects.map((project) => (
              <th key={project._id} scope="col" className={cn(headCell, 'min-w-[132px] text-[var(--apple-label)]')}>
                <span className="block max-w-[180px] truncate text-[12px]" title={project.name}>
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
              rowSpan={2}
              scope="col"
              className={cn(headCell, pinRight, 'w-24 border-l border-[var(--apple-separator)]')}
              style={{ right: remainingRight }}
            >
              Remaining
            </th>
            {canApprove && (
              <th rowSpan={2} scope="col" className={cn(headCell, pinRight, 'w-24')} style={{ right: approvalsRight }}>
                Approvals
              </th>
            )}
            {canEdit && (
              <th rowSpan={2} scope="col" className={cn(headCell, pinRight, 'w-[120px]')} style={{ right: actionsRight }}>
                Actions
              </th>
            )}
            <th rowSpan={2} scope="col" className={cn(headCell, pinRight, 'w-[152px]')} style={{ right: statusRight }}>
              Status
            </th>
          </tr>
          <tr className="border-b border-[var(--apple-separator)]">
            {projects.map((project) => (
              <th key={project._id} scope="col" className={cn(headCell, 'font-normal')}>
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
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={8 + projects.length} className="px-3 py-10 text-center text-[var(--apple-secondary-label)]">
                No resources match these filters.
              </td>
            </tr>
          )}
          {rows.map((row, index) => {
            const pending = row.pendingRequest
            const ownPending = !!pending && pending.requestedBy._id === currentUserId
            // A PM cannot raise a second request while one is pending; Admin/HR may still edit directly.
            const manageBlocked = !!pending && !canApprove
            return (
              <tr
                key={row.memberId}
                data-status={row.status}
                className={cn(
                  'border-b border-[var(--apple-separator)] last:border-b-0',
                  row.status === 'over' && '[&>td]:bg-[color-mix(in_srgb,var(--apple-system-red)_6%,var(--card))]'
                )}
              >
                <td className={cn('px-3 py-3 tabular-nums text-[var(--apple-secondary-label)]', pinLeft, 'lg:left-0')}>
                  {rowOffset + index + 1}
                </td>
                <td className={cn('px-3 py-3', pinLeft, 'lg:left-12')}>
                  <span className="inline-block max-w-[128px] truncate rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] px-2 py-0.5 text-[11px] text-[var(--apple-label)]">
                    {row.roleLabel}
                  </span>
                </td>
                <td className={cn('px-3 py-3', pinLeft, 'lg:left-48')}>
                  <div className="flex items-center gap-2.5">
                    <GravatarAvatar
                      user={{ ...splitName(row.name), email: row.email, avatar: row.avatar }}
                      size={30}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[var(--apple-label)]">{row.name}</p>
                      <p className="max-w-[170px] truncate text-[11px] text-[var(--apple-secondary-label)]">{row.email}</p>
                    </div>
                  </div>
                </td>
                <td className={cn('px-3 py-3 border-r border-[var(--apple-separator)]', pinLeft, 'lg:left-[432px]')}>
                  <span className={cn('font-semibold tabular-nums', row.total > threshold && 'text-[var(--apple-system-red)]')}>
                    {row.total}%
                  </span>
                  <span aria-hidden className="mt-1.5 block h-1 w-24 overflow-hidden rounded-full bg-[var(--apple-tertiary-fill)]">
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
                  className={cn(
                    'px-3 py-3 font-semibold tabular-nums text-[var(--apple-system-green)] border-l border-[var(--apple-separator)]',
                    pinRight
                  )}
                  style={{ right: remainingRight }}
                >
                  {row.remaining}%
                </td>
                {canApprove && (
                  <td className={cn('px-3 py-3', pinRight)} style={{ right: approvalsRight }}>
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
                  <td className={cn('px-3 py-3', pinRight)} style={{ right: actionsRight }}>
                    {ownPending && !canApprove ? (
                      <button
                        type="button"
                        onClick={() => onOpenRequest(pending!.id)}
                        aria-label={`View request for ${row.name}`}
                        className="mb-1 block text-[12px] font-medium text-[var(--apple-system-blue)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-system-blue)] rounded-sm"
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
                <td className={cn('px-3 py-3', pinRight)} style={{ right: statusRight }}>
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
