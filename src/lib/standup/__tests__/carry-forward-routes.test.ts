/**
 * The Phase 9 routes (spec CFW-6, CFW-7, CFW-10, CFW-11, §17.6).
 *
 * Mirrors `variance-routes.test.ts`'s approach: the service layer already
 * proves the rules, so what is testable here is the contract around them —
 * that the register's write is actually reachable, gated correctly, and
 * carries the same version guard every other mutation does.
 */
import fs from 'fs'
import path from 'path'

import { Permission } from '@/lib/permissions/permission-definitions'

import * as carryForwardRoute from '@/app/api/standups/[id]/carry-forward/route'
import * as noteRoute from '@/app/api/carry-forward/[itemId]/note/route'
import * as resolveRoute from '@/app/api/carry-forward/[itemId]/resolve/route'

const sourceOf = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8')

const carryForward = sourceOf('src/app/api/standups/[id]/carry-forward/route.ts')
const note = sourceOf('src/app/api/carry-forward/[itemId]/note/route.ts')
const resolve = sourceOf('src/app/api/carry-forward/[itemId]/resolve/route.ts')

describe('the carry-forward routes', () => {
  it('expose the handlers Panel 4 needs', () => {
    expect(typeof carryForwardRoute.GET).toBe('function')
    expect(typeof carryForwardRoute.POST).toBe('function')
    expect(typeof noteRoute.POST).toBe('function')
    expect(typeof resolveRoute.POST).toBe('function')
  })

  it('opt out of static rendering', () => {
    for (const route of [carryForwardRoute, noteRoute, resolveRoute]) {
      expect(route.dynamic).toBe('force-dynamic')
    }
  })

  it('the register read and build both go through the shared standup wrapper', () => {
    expect(carryForward).toContain('withStandupIdPermission')
  })

  it('note and resolve go through the item-scoped wrapper, so org isolation is enforced there once', () => {
    expect(note).toContain('withCarryForwardItemPermission')
    expect(resolve).toContain('withCarryForwardItemPermission')
  })
})

describe('permission gating (SEC-1)', () => {
  it('reading the register needs only standup:view', () => {
    expect(carryForward).toContain('Permission.STANDUP_VIEW')
  })

  it('building the next set needs standup:complete, the same as posting the variance ledger', () => {
    expect(carryForward).toContain('Permission.STANDUP_COMPLETE')
  })

  it('adding a note needs its own dedicated permission, separate from standup:run', () => {
    expect(note).toContain('Permission.STANDUP_CARRY_FORWARD_NOTE')
  })

  it('resolving an item is a run-screen action, gated on standup:run', () => {
    expect(resolve).toContain('Permission.STANDUP_RUN')
  })
})

describe('the version guard (RUN-23)', () => {
  it('reads the version before building the register', () => {
    expect(carryForward).toContain('requireStandupVersion')
  })

  it('refuses a stale version rather than building against a board nobody saw', () => {
    expect(carryForward).toContain('STALE_STANDUP')
  })

  it('the read-only GET carries no version requirement', () => {
    // A GET that demanded a version header would be unreadable until the
    // client had already read it once. `requireStandupVersion` is imported
    // once and called once — inside POST, not GET.
    const getHandler = carryForward.slice(
      carryForward.indexOf('export const GET'),
      carryForward.indexOf('export const POST')
    )
    expect(getHandler).not.toContain('requireStandupVersion(')
  })
})

describe('the write is actually reachable ahead of Phase 10', () => {
  it('calls buildCarryForwardSet, the same seam-exposure pattern variance/route.ts uses for classifyAndPost', () => {
    expect(carryForward).toContain('buildCarryForwardSet')
  })
})
