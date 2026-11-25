/**
 * In-app notifications for resource allocation.
 *
 * Every function here is best effort: it logs and swallows its own failures,
 * because an allocation that was applied must not be reported as failed just
 * because a bell entry could not be written.
 */
import { notificationService } from '@/lib/notification-service'
import { Permission, ROLE_PERMISSIONS, Role } from '@/lib/permissions/permission-definitions'
import { CustomRole } from '@/models/CustomRole'
import { User } from '@/models/User'

const SHEET_URL = '/resource-allocation'

function describeChanges(changed: { projectName: string; previousPercent: number; newPercent: number }[]): string {
  return changed
    .map((line) => `${line.projectName}: ${line.previousPercent}% → ${line.newPercent}%`)
    .join(', ')
}

export async function notifyAllocationChanged(
  orgId: string,
  memberId: string,
  changed: { projectName: string; previousPercent: number; newPercent: number }[]
): Promise<void> {
  try {
    await notificationService.createNotification(memberId, orgId, {
      type: 'resource_allocation',
      title: 'Your allocation changed',
      message: describeChanges(changed),
      data: { entityType: 'resource_allocation', action: 'updated', priority: 'medium', url: SHEET_URL }
    })
  } catch (error) {
    console.error('Failed to notify allocation change:', error)
  }
}

/** Active users in the org who can decide requests, by system role or custom role. */
export async function findApproverIds(orgId: string): Promise<string[]> {
  const approverRoles = (Object.keys(ROLE_PERMISSIONS) as Role[]).filter((role) =>
    ROLE_PERMISSIONS[role].includes(Permission.RESOURCE_ALLOCATION_APPROVE)
  )
  const customRoles = await CustomRole.find({
    organization: orgId,
    isActive: { $ne: false },
    permissions: Permission.RESOURCE_ALLOCATION_APPROVE
  })
    .select('_id')
    .lean()

  const users = await User.find({
    organization: orgId,
    isActive: true,
    $or: [{ role: { $in: approverRoles } }, { customRole: { $in: customRoles.map((role: any) => role._id) } }]
  })
    .select('_id')
    .lean()

  return users.map((user: any) => String(user._id))
}

export async function notifyApprovers(
  orgId: string,
  requestId: string,
  requesterId: string,
  requesterName: string,
  memberName: string
): Promise<void> {
  try {
    const recipients = (await findApproverIds(orgId)).filter((userId) => userId !== requesterId)
    if (recipients.length === 0) return
    await notificationService.createBulkNotifications(recipients, orgId, {
      type: 'resource_allocation',
      title: 'Allocation change awaiting approval',
      message: `${requesterName} requested an allocation change for ${memberName}.`,
      data: {
        entityType: 'resource_allocation',
        entityId: requestId,
        action: 'created',
        priority: 'medium',
        url: `${SHEET_URL}?request=${requestId}`
      }
    })
  } catch (error) {
    console.error('Failed to notify approvers:', error)
  }
}

export async function notifyRequestDecided(
  orgId: string,
  requesterId: string,
  requestId: string,
  decision: 'approved' | 'rejected',
  memberName: string,
  note?: string
): Promise<void> {
  try {
    const verb = decision === 'approved' ? 'approved' : 'rejected'
    await notificationService.createNotification(requesterId, orgId, {
      type: 'resource_allocation',
      title: `Allocation request ${verb}`,
      message: `Your allocation request for ${memberName} was ${verb}.${note ? ` Note: ${note}` : ''}`,
      data: {
        entityType: 'resource_allocation',
        entityId: requestId,
        action: decision,
        priority: 'medium',
        url: `${SHEET_URL}?tab=history`
      }
    })
  } catch (error) {
    console.error('Failed to notify request decision:', error)
  }
}
