/**
 * The Phase 10 override route (Task 6 — OVR-1..7, §14.2, §17.6, SEC-1).
 *
 * Mirrors `variance-routes.test.ts` and `carry-forward-routes.test.ts`'s
 * approach: `issueOverride` already proves the write rules — O6-O10 refused
 * with OVERRIDE_NOT_PERMITTED, a weak justification refused, the acknowledgement
 * gate on over-allocation — against a real database in
 * `override-service.integration.test.ts`. What is testable here, and only
 * here, is the contract around it: that the route is reachable, gated on the
 * right permission, and does *not* carry the version guard that every other
 * mutating stand-up route does.
 */
import fs from 'fs'
import path from 'path'

import { Permission } from '@/lib/permissions/permission-definitions'

import * as overridesRoute from '@/app/api/standups/[id]/overrides/route'

const sourceOf = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8')

const overrides = sourceOf('src/app/api/standups/[id]/overrides/route.ts')

describe('POST /api/standups/:id/overrides', () => {
  it('exposes the handler Panel 5/6/7 override actions need', () => {
    expect(typeof overridesRoute.POST).toBe('function')
  })

  it('opts out of static rendering', () => {
    expect(overridesRoute.dynamic).toBe('force-dynamic')
  })

  it('gates through the shared stand-up-id wrapper, never ad hoc', () => {
    expect(overrides).toContain('withStandupIdPermission')
  })

  it('requires standup:override — a distinct power from running or completing a stand-up', () => {
    expect(overrides).toContain('Permission.STANDUP_OVERRIDE')
  })

  it('calls issueOverride, the seam that actually writes the record and audits it', () => {
    expect(overrides).toContain('issueOverride')
  })

  it('maps a thrown StandupError to the §17.1 envelope via toErrorResponse', () => {
    expect(overrides).toContain('toErrorResponse')
  })

  it('does not require RUN-23 version checking — an override is a sibling record, not a mutation of the stand-up document', () => {
    // Precedent: the carry-forward note and resolve routes (Phase 9) skip the
    // version header for the identical reason, and are not flagged for it.
    expect(overrides).not.toContain('requireStandupVersion')
  })

  it('returns 201 on success, matching a record being created', () => {
    expect(overrides).toMatch(/status:\s*201/)
  })
})

describe('the role matrix behind standup:override (SEC-1)', () => {
  const {
    PROJECT_ROLE_PERMISSIONS,
    ProjectRole
  } = require('@/lib/permissions/permission-definitions')

  it('lets a facilitator-capable project role issue an override', () => {
    expect(PROJECT_ROLE_PERMISSIONS[ProjectRole.PROJECT_MANAGER]).toContain(Permission.STANDUP_OVERRIDE)
  })

  it('does not let a project viewer issue an override', () => {
    expect(PROJECT_ROLE_PERMISSIONS[ProjectRole.PROJECT_VIEWER] ?? []).not.toContain(
      Permission.STANDUP_OVERRIDE
    )
  })
})
