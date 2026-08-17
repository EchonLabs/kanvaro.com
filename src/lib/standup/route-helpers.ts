/**
 * Shared plumbing for stand-up route handlers.
 *
 * Exists so that the module's endpoints cannot each invent their own auth,
 * permission and error handling. Three requirements make that non-negotiable:
 *
 * - **SEC-1** — every permission check is enforced server side on the route.
 *   Hiding a button is explicitly not sufficient.
 * - **§17.1/§17.2** — every failure returns the same `{ error: { code, message,
 *   details? } }` envelope with the catalogued status.
 * - **NFR-11** — the check happens before the handler runs, not inside it.
 */
import { NextRequest, NextResponse } from 'next/server'

import connectDB from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import type { Permission } from '@/lib/permissions/permission-definitions'

import { toErrorResponse } from './errors'

export interface StandupRouteContext {
  userId: string
  organizationId: string
  projectId?: string
  params: Record<string, string>
}

interface HandlerOptions {
  permission: Permission
  /** Route param holding the project id, when the permission is project-scoped. */
  projectIdParam?: string
}

type Handler = (
  request: NextRequest,
  context: StandupRouteContext
) => Promise<NextResponse> | NextResponse

/**
 * Wraps a route handler with connection setup, authentication, a server-side
 * permission check and catalogue-aware error mapping.
 */
export function withStandupPermission(options: HandlerOptions, handler: Handler) {
  return async (request: NextRequest, routeContext?: { params?: Record<string, string> }) => {
    try {
      await connectDB()

      const authResult = await authenticateUser()
      if ('error' in authResult) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status })
      }

      const params = routeContext?.params ?? {}
      const projectId = options.projectIdParam ? params[options.projectIdParam] : undefined

      const allowed = await PermissionService.hasPermission(
        authResult.user.id,
        options.permission,
        projectId
      )

      if (!allowed) {
        return NextResponse.json(
          { error: { code: 'FORBIDDEN', message: 'You do not have permission to do that.' } },
          { status: 403 }
        )
      }

      if (projectId) {
        await PermissionService.requireProjectAccess(authResult.user.id, projectId)
      }

      return await handler(request, {
        userId: authResult.user.id,
        organizationId: authResult.user.organization,
        projectId,
        params
      })
    } catch (error) {
      // StandupErrors carry their own catalogue code and status; anything else
      // collapses to a generic 500 without leaking internals to the client.
      const { status, body } = toErrorResponse(error)
      if (status === 500) {
        console.error('Stand-up route error:', error)
      }
      return NextResponse.json(body, { status })
    }
  }
}

/**
 * Like {@link withStandupPermission}, but for routes keyed by **sprint** id.
 *
 * The planning endpoints live under `/api/sprints/:sprintId/...`, so there is no
 * project id in the path. Falling back to an org-scoped permission check would
 * let a user act on a sprint in a project they cannot see — so the sprint is
 * loaded first and its project drives the check. SEC-1 is about the check being
 * real, not merely present.
 */
export function withSprintPermission(
  options: { permission: Permission; sprintIdParam?: string },
  handler: (
    request: NextRequest,
    context: StandupRouteContext & { sprintId: string; sprint: any }
  ) => Promise<NextResponse> | NextResponse
) {
  return async (request: NextRequest, routeContext?: { params?: Record<string, string> }) => {
    try {
      await connectDB()

      const authResult = await authenticateUser()
      if ('error' in authResult) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status })
      }

      const params = routeContext?.params ?? {}
      const sprintId = params[options.sprintIdParam ?? 'id']

      const { Sprint } = await import('@/models/Sprint')
      const sprint = await Sprint.findById(sprintId).lean()

      if (!sprint) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'That sprint no longer exists.' } },
          { status: 404 }
        )
      }

      // Org isolation before anything else: a sprint in another organisation
      // must look absent, not forbidden.
      if ((sprint as any).organization?.toString() !== authResult.user.organization) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'That sprint no longer exists.' } },
          { status: 404 }
        )
      }

      const projectId = (sprint as any).project?.toString()

      const allowed = await PermissionService.hasPermission(
        authResult.user.id,
        options.permission,
        projectId
      )

      if (!allowed) {
        return NextResponse.json(
          { error: { code: 'FORBIDDEN', message: 'You do not have permission to do that.' } },
          { status: 403 }
        )
      }

      return await handler(request, {
        userId: authResult.user.id,
        organizationId: authResult.user.organization,
        projectId,
        params,
        sprintId,
        sprint
      })
    } catch (error) {
      const { status, body } = toErrorResponse(error)
      if (status === 500) console.error('Stand-up sprint route error:', error)
      return NextResponse.json(body, { status })
    }
  }
}

/**
 * Like {@link withSprintPermission}, but keyed by **poker session** id.
 *
 * Same reasoning: `/api/poker-sessions/:id/...` carries no project id, so the
 * session is loaded and its project drives the permission check. Without this a
 * participant in one project could vote in another project's session.
 */
export function withPokerPermission(
  options: { permission: Permission; sessionIdParam?: string },
  handler: (
    request: NextRequest,
    context: StandupRouteContext & { pokerSession: any }
  ) => Promise<NextResponse> | NextResponse
) {
  return async (request: NextRequest, routeContext?: { params?: Record<string, string> }) => {
    try {
      await connectDB()

      const authResult = await authenticateUser()
      if ('error' in authResult) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status })
      }

      const params = routeContext?.params ?? {}
      const sessionId = params[options.sessionIdParam ?? 'id']

      const { PokerSession } = await import('@/models/PokerSession')
      const pokerSession = await PokerSession.findById(sessionId)

      const missing = NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'That poker session no longer exists.' } },
        { status: 404 }
      )

      if (!pokerSession) return missing
      if (pokerSession.organization?.toString() !== authResult.user.organization) return missing

      const projectId = pokerSession.project?.toString()

      const allowed = await PermissionService.hasPermission(
        authResult.user.id,
        options.permission,
        projectId
      )

      if (!allowed) {
        return NextResponse.json(
          { error: { code: 'FORBIDDEN', message: 'You do not have permission to do that.' } },
          { status: 403 }
        )
      }

      return await handler(request, {
        userId: authResult.user.id,
        organizationId: authResult.user.organization,
        projectId,
        params,
        pokerSession
      })
    } catch (error) {
      const { status, body } = toErrorResponse(error)
      if (status === 500) console.error('Poker route error:', error)
      return NextResponse.json(body, { status })
    }
  }
}

/** Success envelope, matching the shape the rest of the app returns. */
export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ success: true, data }, init)
}

/** Parses a JSON body, returning `{}` rather than throwing on an empty body. */
export async function readJson<T>(request: NextRequest): Promise<Partial<T>> {
  try {
    return (await request.json()) as Partial<T>
  } catch {
    return {}
  }
}
