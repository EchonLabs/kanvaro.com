import { NextResponse } from 'next/server'
import mongoose, { type Model } from 'mongoose'
import { Project } from '@/models/Project'
import { PermissionService, type UserPermissions } from '@/lib/permissions/permission-service'

/**
 * Field allow-lists for update routes (decision record F7).
 *
 * Several update routes passed the request body straight to the database, so a
 * caller could rewrite fields no form ever sends: organization, createdBy,
 * server-computed estimates and counters, and so on. Each route now lists the
 * fields a client may change; everything else in the body is ignored.
 */
export function pickFields<T extends string>(
  body: unknown,
  allowed: readonly T[]
): Partial<Record<T, any>> {
  const picked: Partial<Record<T, any>> = {}
  if (!body || typeof body !== 'object') return picked
  for (const field of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      picked[field] = (body as Record<string, unknown>)[field]
    }
  }
  return picked
}

/**
 * Moving an item to another project: the target must exist in the caller's
 * organisation and be a project the caller can access. Kanvaro never checked
 * the target project (decision record §2.3), so an item could be moved into a
 * project the caller cannot see. Returns an error response, or null when the
 * move is allowed or the project is unchanged.
 */
export async function rejectUnlessProjectMoveAllowed(args: {
  requestedProjectId: unknown
  currentProjectId: string | undefined
  organizationId: string
  permissions: UserPermissions
}): Promise<NextResponse | null> {
  const { requestedProjectId, currentProjectId, organizationId, permissions } = args
  if (requestedProjectId === undefined || requestedProjectId === null || requestedProjectId === '') return null

  const target = String(requestedProjectId)
  if (target === currentProjectId) return null

  const project = await Project.findOne({ _id: target, organization: organizationId }).select('_id').lean()
  if (!project || !PermissionService.canAccessProjectIn(permissions, target)) {
    return NextResponse.json(
      { error: 'You cannot move this item to that project' },
      { status: 403 }
    )
  }
  return null
}

/** A reference as a string id: accepts an id, an ObjectId or a populated `{ _id }`. */
export function refId(value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value === 'object' && '_id' in (value as any)) return String((value as any)._id)
  return String(value)
}

export interface ProjectLink {
  /** Shown in the error, e.g. "story". */
  label: string
  model: Model<any>
  /** The ids being linked in this request (only new or changed links). */
  ids: unknown[]
}

/**
 * Linked items (a task's story, epic, sprint, parent task and dependencies;
 * a story's epic and sprint) must be in the same project as the item that
 * links to them. Kanvaro only checked the item itself, so a link could point
 * into a project the caller cannot see (PR #927 review, decided: same project).
 *
 * Callers pass only the links this request adds or changes, so an item whose
 * older links predate this rule can still be saved. Returns a 400 response,
 * or null when every link is in `projectId`.
 */
export async function rejectLinksOutsideProject(
  projectId: string,
  links: ProjectLink[]
): Promise<NextResponse | null> {
  for (const link of links) {
    const ids = Array.from(new Set(link.ids.map(refId).filter(Boolean)))
    if (ids.length === 0) continue

    const reject = () =>
      NextResponse.json(
        { error: `The linked ${link.label} must be in the same project as this item` },
        { status: 400 }
      )

    if (!projectId || !ids.every((id) => mongoose.Types.ObjectId.isValid(id))) return reject()
    const inProject = await link.model.countDocuments({ _id: { $in: ids }, project: projectId })
    if (inProject !== ids.length) return reject()
  }
  return null
}
