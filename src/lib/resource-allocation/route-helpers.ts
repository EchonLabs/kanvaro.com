/**
 * Shared plumbing for the resource allocation routes.
 *
 * Every route goes through {@link withRaPermission}: connect, authenticate,
 * resolve the caller's permissions once, refuse with 403 unless they hold one
 * of the route's permissions, then map any thrown error to the module's
 * envelope. The resolved permission set is handed to the handler so a route
 * like POST /changes can choose "apply" vs "request" without a second lookup.
 */
import { NextRequest, NextResponse } from 'next/server'

import connectDB from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import type { Permission } from '@/lib/permissions/permission-definitions'
import { ok, readJson } from '@/lib/standup/route-helpers'

import { toRaErrorResponse } from './errors'

export { ok, readJson }

export interface RaRouteContext {
  userId: string
  organizationId: string
  params: Record<string, string>
  permissions: Set<Permission>
}

type Handler = (request: NextRequest, context: RaRouteContext) => Promise<NextResponse> | NextResponse

export function withRaPermission(options: { anyOf: Permission[] }, handler: Handler) {
  return async (request: NextRequest, routeContext?: { params?: Record<string, string> }) => {
    try {
      await connectDB()

      const authResult = await authenticateUser()
      if ('error' in authResult) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status })
      }

      const { globalPermissions } = await PermissionService.getUserPermissions(authResult.user.id)
      const permissions = new Set<Permission>(globalPermissions)
      if (!options.anyOf.some((permission) => permissions.has(permission))) {
        return NextResponse.json(
          { error: { code: 'FORBIDDEN', message: 'You do not have permission to do that.' } },
          { status: 403 }
        )
      }

      return await handler(request, {
        userId: authResult.user.id,
        organizationId: authResult.user.organization,
        params: routeContext?.params ?? {},
        permissions
      })
    } catch (error) {
      const { status, body } = toRaErrorResponse(error)
      if (status === 500) console.error('Resource allocation route error:', error)
      return NextResponse.json(body, { status })
    }
  }
}

/** Reads `page`/`limit` query params, clamped to sane bounds. */
export function pageParams(
  request: NextRequest,
  defaults: { page: number; limit: number } = { page: 1, limit: 10 },
  maxLimit = 100
): { page: number; limit: number } {
  const read = (name: string, fallback: number) => {
    const value = Number(request.nextUrl.searchParams.get(name))
    return Number.isInteger(value) && value > 0 ? value : fallback
  }
  return { page: read('page', defaults.page), limit: Math.min(maxLimit, read('limit', defaults.limit)) }
}

/** A query param as a trimmed string, or undefined when absent/blank. */
export function queryParam(request: NextRequest, name: string): string | undefined {
  const value = request.nextUrl.searchParams.get(name)?.trim()
  return value ? value : undefined
}
