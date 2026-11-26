/**
 * A small, realistic organisation for the resource allocation suites.
 *
 * Seeded through the real models (not raw inserts) so schema defaults and
 * validators apply exactly as they do in the app. Every suite gets a fresh copy
 * because `useMongo` empties collections between tests.
 */
import mongoose from 'mongoose'

import { Organization } from '@/models/Organization'
import { Project } from '@/models/Project'
import { User } from '@/models/User'
import { CustomRole } from '@/models/CustomRole'
import { ResourceAllocation } from '@/models/ResourceAllocation'

let counter = 0

export async function makeUser(
  organization: mongoose.Types.ObjectId,
  firstName: string,
  role: string,
  extra: Record<string, unknown> = {}
) {
  counter += 1
  return User.create({
    firstName,
    lastName: 'Tester',
    email: `${firstName.toLowerCase()}.${counter}@example.com`,
    password: 'hashed',
    role,
    organization,
    isActive: true,
    ...extra
  })
}

export async function makeProject(
  organization: mongoose.Types.ObjectId,
  name: string,
  createdBy: mongoose.Types.ObjectId,
  extra: Record<string, unknown> = {}
) {
  counter += 1
  return Project.create({
    name,
    organization,
    createdBy,
    projectNumber: counter,
    startDate: new Date('2026-11-01'),
    status: 'active',
    ...extra
  })
}

export async function seedWorld(threshold = 100) {
  const org = await Organization.create({
    name: 'Acme',
    settings: { resourceAllocation: { overAllocationThresholdPercent: threshold } }
  })
  const otherOrg = await Organization.create({ name: 'Other Co' })
  const organization = org._id as mongoose.Types.ObjectId

  const admin = await makeUser(organization, 'Admin', 'admin')
  const hr = await makeUser(organization, 'Hanna', 'human_resource')
  const pm = await makeUser(organization, 'Pamela', 'project_manager')
  const otherPm = await makeUser(organization, 'Peter', 'project_manager')
  const member = await makeUser(organization, 'Dulmi', 'team_member', { hourlyRate: 25 })
  const qa = await makeUser(organization, 'Nadeeshani', 'qa_engineer')
  const inactive = await makeUser(organization, 'Gone', 'team_member', { isActive: false })
  const client = await makeUser(organization, 'Clara', 'client')
  const viewer = await makeUser(organization, 'Victor', 'viewer')
  const accountManager = await makeUser(organization, 'Andy', 'account_manager')
  const outsider = await makeUser(otherOrg._id as mongoose.Types.ObjectId, 'Olaf', 'team_member')

  const approverRole = await CustomRole.create({
    name: 'Resource Lead',
    description: 'Can approve allocation requests',
    permissions: ['resource_allocation:approve', 'resource_allocation:view'],
    organization,
    createdBy: admin._id
  })
  const lead = await makeUser(organization, 'Leila', 'team_member', { customRole: approverRole._id })

  // PM is project manager of P1 through an explicit project role; P2 belongs to otherPm.
  const p1 = await makeProject(organization, 'AVO', admin._id, {
    projectRoles: [{ user: pm._id, role: 'project_manager', assignedBy: admin._id, assignedAt: new Date() }]
  })
  const p2 = await makeProject(organization, 'BaseNeo SaaS', otherPm._id, { isBillableByDefault: false })
  const p3 = await makeProject(organization, 'Completed One', admin._id, { status: 'completed' })
  const p4 = await makeProject(organization, 'Archived One', admin._id, { archived: true })
  const p5 = await makeProject(otherOrg._id as mongoose.Types.ObjectId, 'Foreign', outsider._id)

  return {
    org,
    otherOrg,
    organizationId: String(org._id),
    users: { admin, hr, pm, otherPm, member, qa, inactive, client, viewer, accountManager, outsider, lead },
    projects: { p1, p2, p3, p4, p5 }
  }
}

/** Plants a live allocation row directly — for arranging state, never for asserting the writer. */
export async function plant(
  organization: unknown,
  member: unknown,
  project: unknown,
  percent: number,
  updatedBy: unknown
) {
  return ResourceAllocation.create({ organization, member, project, percent, updatedBy })
}
