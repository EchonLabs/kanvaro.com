/**
 * Decision record F1: GET /api/members returned every user's password-reset
 * OTP and token, so any signed-in user (clients and viewers included) could
 * take over any account. Also: invitation tokens, pay rates, an unescaped
 * search regex, and a PUT that saved the raw body (role, password, anything).
 */
import { NextRequest } from 'next/server'
import { Role, ROLE_PERMISSIONS } from '@/lib/permissions/permission-definitions'

const perms = (role: Role) => ({
  globalPermissions: [...ROLE_PERMISSIONS[role]],
  projectPermissions: new Map(),
  projectRoles: new Map(),
  userRole: role
})

/** A query chain recording .select() args; awaiting resolves to `value`. */
function chain(value: any, selects: string[] = []) {
  const c: any = {}
  c.select = jest.fn((arg: string) => { selects.push(arg); return c })
  for (const m of ['populate', 'sort', 'skip', 'limit', 'lean']) c[m] = jest.fn(() => c)
  c.then = (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject)
  return c
}

afterEach(() => jest.resetModules())

function load(role: Role, opts: { member?: any; userId?: string } = {}) {
  const userId = opts.userId || 'actor'
  const userSelects: string[] = []
  const invitationSelects: string[] = []
  const userFind = jest.fn(() => chain([], userSelects))
  const save = jest.fn()
  const member = opts.member ? { ...opts.member, save } : null

  jest.doMock('@/lib/db-config', () => ({ __esModule: true, default: jest.fn() }))
  jest.doMock('@/lib/auth-utils', () => ({
    authenticateUser: jest.fn().mockResolvedValue({ user: { id: userId, organization: 'org1', role } })
  }))
  jest.doMock('@/lib/permissions/permission-service', () => {
    const real = jest.requireActual('@/lib/permissions/permission-service')
    return {
      PermissionService: {
        getUserPermissions: jest.fn().mockResolvedValue(perms(role)),
        hasPermissionIn: real.PermissionService.hasPermissionIn,
        hasPermission: jest.fn(async (_id: string, p: string) => perms(role).globalPermissions.includes(p as any))
      }
    }
  })
  jest.doMock('@/models/User', () => ({
    User: {
      find: userFind,
      findOne: jest.fn().mockResolvedValue(member),
      countDocuments: jest.fn().mockResolvedValue(0),
      deleteOne: jest.fn()
    }
  }))
  jest.doMock('@/models/UserInvitation', () => ({
    UserInvitation: { find: jest.fn(() => chain([], invitationSelects)) }
  }))
  jest.doMock('@/models/Project', () => ({
    Project: { updateMany: jest.fn(), find: jest.fn(() => chain([])) }
  }))
  jest.doMock('@/lib/standup/carry-forward-service', () => ({ convertOpenAllocationsToCarryForward: jest.fn() }))

  return { route: require('@/app/api/members/route'), userSelects, invitationSelects, userFind, save, member }
}

const put = (memberId: string, updates: any) =>
  new NextRequest('http://localhost/x', { method: 'PUT', body: JSON.stringify({ memberId, updates }) })

describe('User schema', () => {
  it('never selects the password-reset fields by default', () => {
    const { User } = jest.requireActual('@/models/User')
    for (const field of ['passwordResetOtp', 'passwordResetToken', 'passwordResetExpiry']) {
      expect(User.schema.path(field).options.select).toBe(false)
    }
  })
})

describe('GET /api/members', () => {
  it('excludes the password, and pay rates for people who cannot edit members', async () => {
    const { route, userSelects } = load(Role.TEAM_MEMBER)
    await route.GET(new NextRequest('http://localhost/x'))
    expect(userSelects[0]).toContain('-password')
    expect(userSelects[0]).toContain('-hourlyRate')
    expect(userSelects[0]).toContain('-billingRate')
  })

  it('shows pay rates to people who can edit members', async () => {
    const { route, userSelects } = load(Role.ADMIN)
    await route.GET(new NextRequest('http://localhost/x'))
    expect(userSelects[0]).toBe('-password')
  })

  it('never returns invitation tokens', async () => {
    const { route, invitationSelects } = load(Role.ADMIN)
    await route.GET(new NextRequest('http://localhost/x'))
    expect(invitationSelects).toContain('-token')
  })

  it('escapes the search text before using it as a regex', async () => {
    const { route, userFind } = load(Role.ADMIN)
    await route.GET(new NextRequest('http://localhost/x?search=' + encodeURIComponent('a.*(')))
    const filter = (userFind.mock.calls[0] as any[])[0]
    expect(filter.$or[0].firstName.$regex).toBe('a\\.\\*\\(')
  })

  it('caps an absurd page size at 10000', async () => {
    const { route } = load(Role.ADMIN)
    const res = await route.GET(new NextRequest('http://localhost/x?limit=999999999'))
    expect((await res.json()).data.pagination.limit).toBe(10000)
  })
})

describe('PUT /api/members', () => {
  const teamMember = { _id: 'm1', role: 'team_member', isActive: true, firstName: 'Old', lastName: 'Name' }
  const admin = { _id: 'a1', role: 'admin', isActive: true, firstName: 'Ad', lastName: 'Min' }

  it('saves only known fields: password, organization and others are dropped', async () => {
    const { route, member, save } = load(Role.ADMIN, { member: teamMember })
    await route.PUT(put('m1', { firstName: 'New', password: 'hacked', organization: 'other', emailVerified: true }))
    expect(save).toHaveBeenCalled()
    expect(member.firstName).toBe('New')
    expect(member).not.toHaveProperty('password')
    expect(member).not.toHaveProperty('organization')
    expect(member).not.toHaveProperty('emailVerified')
  })

  it('refuses HR promoting someone to admin', async () => {
    const { route, save } = load(Role.HUMAN_RESOURCE, { member: teamMember })
    expect((await route.PUT(put('m1', { role: 'admin' }))).status).toBe(403)
    expect(save).not.toHaveBeenCalled()
  })

  it('refuses anyone changing their own role', async () => {
    const { route, save } = load(Role.ADMIN, { member: { ...admin, _id: 'actor' }, userId: 'actor' })
    expect((await route.PUT(put('actor', { role: 'team_member' }))).status).toBe(403)
    expect(save).not.toHaveBeenCalled()
  })

  it('refuses HR deactivating an admin', async () => {
    const { route, save } = load(Role.HUMAN_RESOURCE, { member: admin })
    expect((await route.PUT(put('a1', { isActive: false }))).status).toBe(403)
    expect(save).not.toHaveBeenCalled()
  })

  it('lets HR change a team member to project manager', async () => {
    const { route, member } = load(Role.HUMAN_RESOURCE, { member: teamMember })
    expect((await route.PUT(put('m1', { role: 'project_manager' }))).status).toBe(200)
    expect(member.role).toBe('project_manager')
  })

  it('lets an admin promote someone to admin', async () => {
    const { route, member } = load(Role.ADMIN, { member: teamMember })
    expect((await route.PUT(put('m1', { role: 'admin' }))).status).toBe(200)
    expect(member.role).toBe('admin')
  })
})

describe('DELETE /api/members', () => {
  it('refuses a non-admin removing an admin, even with user:manage_roles', async () => {
    const { route } = load(Role.HUMAN_RESOURCE, { member: { _id: 'a1', role: 'admin' } })
    const res = await route.DELETE(new NextRequest('http://localhost/x?memberId=a1', { method: 'DELETE' }))
    expect(res.status).toBe(403)
  })
})

describe('POST /api/auth/verify-otp (reads the now-hidden reset fields)', () => {
  it('asks for the OTP fields explicitly, so password reset keeps working', async () => {
    const selects: string[] = []
    const user = {
      passwordResetOtp: '123456',
      passwordResetExpiry: new Date(Date.now() + 60_000),
      save: jest.fn()
    }
    jest.doMock('@/lib/db-config', () => ({ __esModule: true, default: jest.fn() }))
    jest.doMock('@/models/User', () => ({ User: { findOne: jest.fn(() => chain(user, selects)) } }))
    const route = require('@/app/api/auth/verify-otp/route')

    const res = await route.POST(new Request('http://localhost/x', {
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.c', otp: '123456' })
    }))

    expect(selects).toContain('+passwordResetOtp +passwordResetExpiry')
    expect(res.status).toBe(200)
    expect((await res.json()).resetToken).toEqual(expect.any(String))
  })
})
