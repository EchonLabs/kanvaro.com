import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'
import { User } from '@/models/User'
import { CustomRole } from '@/models/CustomRole'
import { PermissionService } from '@/lib/permissions/permission-service'
import {
  canManageRoles,
  canChangeRoleOf,
  canWorkWithCustomRole
} from '@/lib/permissions/role-grant-policy'

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB()
    
    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    // F11: needs user:manage_roles; nobody changes their own role; only admins
    // act on admins or hand out permissions they do not hold.
    const actor = await PermissionService.getUserPermissions(authResult.user.id)
    const manage = canManageRoles(actor)
    if (!manage.ok) {
      return NextResponse.json({ success: false, error: manage.error }, { status: 403 })
    }

    const body = await req.json()
    const { customRoleId } = body

    // Find the user to update
    const user = await User.findOne({
      _id: params.id,
      organization: authResult.user.organization
    }).populate('customRole', 'permissions')

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'User not found'
      }, { status: 404 })
    }

    const target = canChangeRoleOf(actor, authResult.user.id, { id: user._id.toString(), role: user.role })
    if (!target.ok) {
      return NextResponse.json({ success: false, error: target.error }, { status: 403 })
    }

    // Removing or replacing a custom role that carries permissions beyond the
    // caller's is acting on more power than they have.
    const currentPermissions: string[] = (user.customRole as any)?.permissions || []
    const current = canWorkWithCustomRole(actor, currentPermissions)
    if (!current.ok) {
      return NextResponse.json({ success: false, error: current.error }, { status: 403 })
    }

    // If customRoleId is provided, validate it exists
    if (customRoleId) {
      const customRole = await CustomRole.findOne({
        _id: customRoleId,
        organization: authResult.user.organization,
        isActive: true
      })

      if (!customRole) {
        return NextResponse.json({
          success: false,
          error: 'Custom role not found'
        }, { status: 404 })
      }

      const grant = canWorkWithCustomRole(actor, customRole.permissions || [])
      if (!grant.ok) {
        return NextResponse.json({ success: false, error: grant.error }, { status: 403 })
      }

      user.customRole = customRole._id
    } else {
      // Remove custom role
      user.customRole = undefined
    }

    await user.save()

    return NextResponse.json({
      success: true,
      data: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        customRole: user.customRole
      },
      message: 'User role updated successfully'
    }, { status: 200 })

  } catch (error) {
    console.error('Error updating user role:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}
