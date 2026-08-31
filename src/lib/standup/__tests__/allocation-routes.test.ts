/**
 * The Phase 7 routes (Task 8 — RUN-23, RUN-25, NFR-5, SEC-1).
 *
 * Three things are worth testing at this layer, and the suite is limited to
 * them because everything else is already proven where it lives: the write
 * rules in `allocation-service`, the detachment loop in `attendance-service`,
 * the check table in `completion-checks`.
 *
 * 1. **The version header is read, and a missing one is refused.** RUN-23's
 *    guarantee is only as strong as its weakest caller, and the failure mode of
 *    a mis-spelled header is silent: the guard degrades to "always allow"
 *    rather than erroring, which is the worst possible outcome for a
 *    concurrency control.
 * 2. **Each route is gated on the right permission**, and reading the board is
 *    a different power from filling it (SEC-1).
 * 3. **The handlers exist and opt out of static rendering**, so a board is
 *    never served from build-time cache.
 */
import fs from 'fs'
import path from 'path'

import { NextRequest } from 'next/server'

import { Permission } from '@/lib/permissions/permission-definitions'
import { requireStandupVersion, STANDUP_VERSION_HEADER } from '../route-helpers'

import * as boardRoute from '@/app/api/standups/[id]/allocations/route'
import * as rowRoute from '@/app/api/standups/[id]/allocations/[allocationId]/route'
import * as attendanceRoute from '@/app/api/standups/[id]/attendance/route'
import * as checksRoute from '@/app/api/standups/[id]/checks/route'

const requestWith = (version?: string) =>
  new NextRequest('http://localhost/api/standups/x/allocations', {
    headers: version === undefined ? {} : { [STANDUP_VERSION_HEADER]: version }
  })

const sourceOf = (relative: string) =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8')

describe('requireStandupVersion (RUN-23)', () => {
  it('reads a valid version', () => {
    expect(requireStandupVersion(requestWith('4'))).toBe(4)
  })

  it('accepts zero — a stand-up nobody has written to yet', () => {
    expect(requireStandupVersion(requestWith('0'))).toBe(0)
  })

  it('refuses a missing header rather than defaulting to zero', () => {
    // Defaulting would let a client that has never read the stand-up win a race
    // against one that has, inverting the guarantee entirely.
    expect(() => requireStandupVersion(requestWith())).toThrow(
      /missing the stand-up version/
    )
  })

  it('refuses an empty header', () => {
    expect(() => requireStandupVersion(requestWith('   '))).toThrow(
      /missing the stand-up version/
    )
  })

  it('refuses a non-numeric header', () => {
    expect(() => requireStandupVersion(requestWith('latest'))).toThrow(/whole number/)
  })

  it('refuses a fractional header', () => {
    expect(() => requireStandupVersion(requestWith('4.5'))).toThrow(/whole number/)
  })

  it('refuses a negative header', () => {
    expect(() => requireStandupVersion(requestWith('-1'))).toThrow(/whole number/)
  })

  it('carries the catalogue code, so the client gets the §17.1 envelope', () => {
    expect(() => requireStandupVersion(requestWith())).toThrow(
      expect.objectContaining({ code: 'VALIDATION_FAILED' })
    )
  })
})

describe('the four routes', () => {
  it('expose the handlers Panel 1, Panel 5 and Panel 7 need', () => {
    expect(typeof boardRoute.GET).toBe('function')
    expect(typeof boardRoute.POST).toBe('function')
    expect(typeof rowRoute.PATCH).toBe('function')
    expect(typeof rowRoute.DELETE).toBe('function')
    expect(typeof attendanceRoute.PATCH).toBe('function')
    expect(typeof attendanceRoute.POST).toBe('function')
    expect(typeof checksRoute.GET).toBe('function')
  })

  it('opt out of static rendering, so a board is never served from build cache', () => {
    for (const route of [boardRoute, rowRoute, attendanceRoute, checksRoute]) {
      expect(route.dynamic).toBe('force-dynamic')
    }
  })
})

describe('permission gating (SEC-1)', () => {
  const board = sourceOf('src/app/api/standups/[id]/allocations/route.ts')
  const row = sourceOf('src/app/api/standups/[id]/allocations/[allocationId]/route.ts')
  const attendance = sourceOf('src/app/api/standups/[id]/attendance/route.ts')
  const checks = sourceOf('src/app/api/standups/[id]/checks/route.ts')

  it('reading the board needs only standup:view', () => {
    expect(board).toContain('Permission.STANDUP_VIEW')
    expect(checks).toContain('Permission.STANDUP_VIEW')
  })

  it('every mutation needs a stronger permission than reading', () => {
    // The board's GET and POST must not share a permission: seeing who is
    // planned to do what and deciding it are different powers.
    expect(board).toContain('Permission.STANDUP_ALLOCATE')
    expect(row).toContain('Permission.STANDUP_ALLOCATE')
    expect(attendance).toContain('Permission.STANDUP_RUN')
    expect(attendance).toContain('Permission.STANDUP_ALLOCATE')
  })

  it('gates every route through the shared wrapper, never ad hoc', () => {
    for (const source of [board, row, attendance, checks]) {
      expect(source).toContain('withStandupIdPermission')
    }
  })

  it('reads the version on every mutating route and no read-only one', () => {
    expect(board).toContain('requireStandupVersion')
    expect(row).toContain('requireStandupVersion')
    expect(attendance).toContain('requireStandupVersion')
    // A GET has nothing to guard against, and demanding a header would make the
    // board unreadable until the client had already read it.
    expect(checks).not.toContain('requireStandupVersion')
  })
})

describe('the role matrix behind those permissions (NFR-13, SEC-1)', () => {
  const {
    PROJECT_ROLE_PERMISSIONS,
    ProjectRole
  } = require('@/lib/permissions/permission-definitions')

  it('lets a Project Manager fill the board', () => {
    expect(PROJECT_ROLE_PERMISSIONS[ProjectRole.PROJECT_MANAGER]).toContain(
      Permission.STANDUP_ALLOCATE
    )
  })

  it('does not let a project member allocate for other people', () => {
    // ALO-23 self-select is `standup:allocate_own`, a different grant, and its
    // surface is Phase 11.
    expect(PROJECT_ROLE_PERMISSIONS[ProjectRole.PROJECT_MEMBER]).not.toContain(
      Permission.STANDUP_ALLOCATE
    )
  })

  it('does not let a project viewer touch anything', () => {
    for (const permission of [
      Permission.STANDUP_ALLOCATE,
      Permission.STANDUP_RUN,
      Permission.STANDUP_ALLOCATE_OWN
    ]) {
      expect(PROJECT_ROLE_PERMISSIONS[ProjectRole.PROJECT_VIEWER]).not.toContain(permission)
    }
  })
})
