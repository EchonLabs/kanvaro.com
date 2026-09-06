/**
 * Org isolation in the sprint/poker route helpers (SEC-1).
 *
 * This exists because of a real defect that the whole Phase 2 integration suite
 * missed: `authenticateUser` declares `organization: string` but actually
 * returns the Mongoose document's ObjectId. The helpers compared
 * `sprint.organization.toString()` against that raw ObjectId, so the comparison
 * was *always* unequal and every planning, poker and estimate route answered
 * 404 for its own organisation's data.
 *
 * The service-layer tests could not catch it — they call the services directly
 * and never go through a route helper. So this asserts the comparison itself,
 * against both shapes the auth layer can hand over.
 */
import mongoose from 'mongoose'

/** The exact comparison the helpers perform. */
const isForeign = (entityOrg: unknown, userOrg: unknown) =>
  (entityOrg as any)?.toString() !== (userOrg as any)?.toString()

describe('route helper organisation comparison', () => {
  const orgId = new mongoose.Types.ObjectId()
  const otherOrgId = new mongoose.Types.ObjectId()

  it('accepts an ObjectId user organisation — what authenticateUser really returns', () => {
    expect(isForeign(orgId, orgId)).toBe(false)
  })

  it('accepts a string user organisation — what its type signature claims', () => {
    expect(isForeign(orgId, orgId.toString())).toBe(false)
  })

  it('accepts a string entity organisation against an ObjectId user', () => {
    expect(isForeign(orgId.toString(), orgId)).toBe(false)
  })

  it('still rejects a genuinely different organisation, whatever the shapes', () => {
    expect(isForeign(orgId, otherOrgId)).toBe(true)
    expect(isForeign(orgId, otherOrgId.toString())).toBe(true)
    expect(isForeign(orgId.toString(), otherOrgId)).toBe(true)
  })

  it('treats a missing organisation on either side as foreign', () => {
    expect(isForeign(undefined, orgId)).toBe(true)
    expect(isForeign(orgId, undefined)).toBe(true)
  })
})

describe('the helpers use a two-sided toString', () => {
  const fs = require('fs')
  const path = require('path')

  const sources = [
    'src/lib/standup/route-helpers.ts',
    'src/app/api/tasks/[id]/estimate/route.ts'
  ]

  it.each(sources)('%s never compares against a bare user.organization', (file) => {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
    // A comparison ending in `user.organization` (no `.toString()`) is the bug.
    expect(source).not.toMatch(/!==\s*\w+\.user\.organization\s*[),{]/)
  })
})
