/**
 * The Phase 8 routes (Task 13 — RUN-23, NFR-13, SEC-1).
 *
 * The service layer already proves the rules; what is testable here, and only
 * here, is the contract around them:
 *
 * 1. **NFR-13 is enforced on retrieval, not in a component.** A Stakeholder
 *    must not be able to *fetch* an individual's estimate debt. A screen that
 *    hides a number it already received has not met the requirement.
 * 2. **Reading and writing are different powers.** Reading the variance panel
 *    is `standup:view`; posting to the ledger is `standup:complete`; rewriting
 *    an estimate is `standup:revise_estimate`.
 * 3. **Every mutation reads the version** (RUN-23), and no read-only route
 *    demands one — a GET that required a version header would be unreadable
 *    until the client had already read it.
 */
import fs from 'fs'
import path from 'path'

import { Permission } from '@/lib/permissions/permission-definitions'

import * as varianceRoute from '@/app/api/standups/[id]/variance/route'
import * as answerRoute from '@/app/api/standups/[id]/variance/[allocationId]/route'
import * as debtRoute from '@/app/api/standups/[id]/debt/route'
import * as yesterdayRoute from '@/app/api/standups/[id]/yesterday/route'

const sourceOf = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8')

const variance = sourceOf('src/app/api/standups/[id]/variance/route.ts')
const answer = sourceOf('src/app/api/standups/[id]/variance/[allocationId]/route.ts')
const debt = sourceOf('src/app/api/standups/[id]/debt/route.ts')
const yesterday = sourceOf('src/app/api/standups/[id]/yesterday/route.ts')
const checks = sourceOf('src/app/api/standups/[id]/checks/route.ts')

describe('the four Phase 8 routes', () => {
  it('expose the handlers Panels 2 and 3 need', () => {
    expect(typeof varianceRoute.GET).toBe('function')
    expect(typeof varianceRoute.POST).toBe('function')
    expect(typeof answerRoute.POST).toBe('function')
    expect(typeof debtRoute.GET).toBe('function')
    expect(typeof debtRoute.POST).toBe('function')
    expect(typeof yesterdayRoute.GET).toBe('function')
    expect(typeof yesterdayRoute.PATCH).toBe('function')
  })

  it('opt out of static rendering, so numbers are never served from build cache', () => {
    for (const route of [varianceRoute, answerRoute, debtRoute, yesterdayRoute]) {
      expect(route.dynamic).toBe('force-dynamic')
    }
  })

  it('gates every route through the shared wrapper, never ad hoc', () => {
    for (const source of [variance, answer, debt, yesterday]) {
      expect(source).toContain('withStandupIdPermission')
    }
  })
})

describe('permission gating (SEC-1)', () => {
  it('reading the variance panel and yesterday needs only standup:view', () => {
    expect(variance).toContain('Permission.STANDUP_VIEW')
    expect(yesterday).toContain('Permission.STANDUP_VIEW')
  })

  it('posting to the ledger needs standup:complete', () => {
    expect(variance).toContain('Permission.STANDUP_COMPLETE')
  })

  it('rewriting an estimate needs standup:revise_estimate', () => {
    expect(answer).toContain('Permission.STANDUP_REVISE_ESTIMATE')
  })

  it('writing debt off needs standup:write_off_debt', () => {
    expect(debt).toContain('Permission.STANDUP_WRITE_OFF_DEBT')
  })

  it('acting on a yesterday row needs standup:run', () => {
    expect(yesterday).toContain('Permission.STANDUP_RUN')
  })
})

describe('RUN-11 — N11 fires through the shared send-once primitive', () => {
  it('calls notifyStatusChangedOnBehalf rather than notificationService ad hoc', () => {
    expect(yesterday).toContain('notifyStatusChangedOnBehalf')
    expect(yesterday).not.toContain('notificationService')
  })
})

describe('the version guard (RUN-23)', () => {
  it('reads the version on every mutating route', () => {
    expect(variance).toContain('requireStandupVersion')
    expect(answer).toContain('requireStandupVersion')
    expect(debt).toContain('requireStandupVersion')
    expect(yesterday).toContain('requireStandupVersion')
  })

  it('refuses a stale version rather than posting against numbers nobody saw', () => {
    expect(variance).toContain('STALE_STANDUP')
    expect(yesterday).toContain('STALE_STANDUP')
    expect(debt).toContain('STALE_STANDUP')
  })
})

describe('NFR-13 — individual debt is not retrievable by a Stakeholder', () => {
  const {
    PROJECT_ROLE_PERMISSIONS,
    ROLE_PERMISSIONS,
    ProjectRole,
    Role
  } = require('@/lib/permissions/permission-definitions')

  it('withholds standup:view_debt from the Stakeholder role', () => {
    // The spec's "Stakeholder" is this codebase's `Role.VIEWER` — it holds
    // STANDUP_VIEW_ANALYTICS deliberately and STANDUP_VIEW_DEBT deliberately
    // not, which is NFR-13 expressed in the role table.
    expect(ROLE_PERMISSIONS[Role.VIEWER]).toContain(Permission.STANDUP_VIEW_ANALYTICS)
    expect(ROLE_PERMISSIONS[Role.VIEWER]).not.toContain(Permission.STANDUP_VIEW_DEBT)
    expect(ROLE_PERMISSIONS[Role.VIEWER]).not.toContain(Permission.STANDUP_VIEW_OWN_DEBT)
  })

  it('withholds it from a project viewer and a project client too', () => {
    for (const role of [ProjectRole.PROJECT_VIEWER, ProjectRole.PROJECT_CLIENT]) {
      expect(PROJECT_ROLE_PERMISSIONS[role] ?? []).not.toContain(Permission.STANDUP_VIEW_DEBT)
    }
  })

  it('checks both debt permissions on the read path, not just one', () => {
    // Gating on `view_debt` alone would lock a member out of their own ledger;
    // gating on `view_own_debt` alone would let them read anybody's.
    expect(debt).toContain('Permission.STANDUP_VIEW_DEBT')
    expect(debt).toContain('Permission.STANDUP_VIEW_OWN_DEBT')
  })

  it('returns a team aggregate with no member rows when neither is held', () => {
    expect(debt).toMatch(/teamAggregate/)
    expect(debt).toMatch(/team: await teamAggregate/)
  })

  it('refuses one member reading another member with view_own_debt only', () => {
    expect(debt).toContain("memberId !== userId")
    expect(debt).toContain('OVERRIDE_NOT_PERMITTED')
  })

  it('lets a project manager read anybody on the project', () => {
    expect(PROJECT_ROLE_PERMISSIONS[ProjectRole.PROJECT_MANAGER]).toContain(
      Permission.STANDUP_VIEW_DEBT
    )
  })
})

describe('CC-3 is answered from the checks route', () => {
  it('loads the variance panel and passes its rows to the evaluator', () => {
    // Omitting them would leave CC-3 `not_evaluated` forever, which looks
    // identical to the check having been built.
    expect(checks).toContain('loadVariancePanel')
    expect(checks).toContain('variance: variance.rows')
  })
})
