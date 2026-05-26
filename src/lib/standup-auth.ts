import mongoose from 'mongoose'
import { User } from '@/models/User'
import { Project } from '@/models/Project'
import { AuthUser } from '@/lib/auth-utils'

export type StandupAccessLevel = 'full' | 'own' | 'none'

const FULL_VIEW_ORG_ROLES = new Set([
  'admin',
  'human_resource',
  'project_manager',
  'account_manager',
])

const FULL_VIEW_PROJECT_ROLES = new Set([
  'project_manager',
  'project_account_manager',
])

const OWN_DATA_PROJECT_ROLES = new Set([
  'project_member',
  'project_qa_lead',
  'project_tester',
  'project_viewer',
  'project_client',
])

/**
 * Determines a user's standup access level for a specific project.
 *
 * Returns:
 *   'full' — can see all members, AI analysis, PM notes (PM/HR/Admin/BA)
 *   'own'  — can only see their own commitment data (team members, QA, testers)
 *   'none' — no access (client, viewer at org level)
 */
export async function getStandupAccessLevel(
  authUser: AuthUser,
  projectId: string
): Promise<{ level: StandupAccessLevel; isMember: boolean }> {
  // Admins and HR see everything org-wide
  if (authUser.role === 'admin' || authUser.role === 'human_resource') {
    return { level: 'full', isMember: true }
  }

  // Fetch full user to inspect projectRoles
  const user = await User.findById(authUser.id).select('projectRoles role').lean() as any
  if (!user) return { level: 'none', isMember: false }

  // Check project membership via Project.teamMembers
  const project = await Project.findById(projectId)
    .select('teamMembers createdBy')
    .lean() as any

  if (!project) return { level: 'none', isMember: false }

  const memberSet = new Set([
    ...(project.teamMembers ?? []).map((id: any) => id.toString()),
    project.createdBy?.toString(),
  ])
  const isMember = memberSet.has(authUser.id)

  // Check project-specific role first
  const projectRole = user.projectRoles?.find(
    (pr: any) => pr.project.toString() === projectId
  )

  if (projectRole) {
    if (FULL_VIEW_PROJECT_ROLES.has(projectRole.role)) {
      return { level: 'full', isMember: true }
    }
    if (OWN_DATA_PROJECT_ROLES.has(projectRole.role)) {
      return { level: 'own', isMember: true }
    }
  }

  // Fall back to org-level role
  if (FULL_VIEW_ORG_ROLES.has(authUser.role)) {
    return { level: isMember ? 'full' : 'none', isMember }
  }

  // team_member, qa_engineer, tester at org level
  if (['team_member', 'qa_engineer', 'tester'].includes(authUser.role)) {
    return { level: isMember ? 'own' : 'none', isMember }
  }

  return { level: 'none', isMember: false }
}

/**
 * Filters a standup session response based on access level.
 * Full view: returns everything.
 * Own view: strips out other members' data from briefingSnapshot and analysis.
 */
export function filterSessionByAccess(session: any, userId: string, level: StandupAccessLevel) {
  if (level === 'full') return session

  const filtered = { ...session }

  // Strip AI analysis entirely from own-data view
  filtered.analysis = null

  // Filter briefing snapshot to only this user's gaps and notes
  if (filtered.briefingSnapshot) {
    const snap = filtered.briefingSnapshot
    filtered.briefingSnapshot = {
      ...snap,
      gaps: snap.gaps?.filter((g: any) => g.userId?.toString() === userId) ?? [],
      noMovementTasks: snap.noMovementTasks?.filter(
        (t: any) => t.assignedUserId?.toString() === userId
      ) ?? [],
      zeroTimeTasks: snap.zeroTimeTasks?.filter(
        (t: any) => t.assignedUserId?.toString() === userId
      ) ?? [],
      openNotes: snap.openNotes?.filter((n: any) => n.userId?.toString() === userId) ?? [],
    }
  }

  return filtered
}
