import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'
import { CustomRole } from '@/models/CustomRole'
import { User } from '@/models/User'
import { Permission } from '@/lib/permissions/permission-definitions'

/**
 * Get predefined system role names
 * This function returns the names of all predefined roles that cannot be duplicated
 */
function getPredefinedRoleNames(): string[] {
  return [
    'Administrator',
    'Project Manager',
    'Team Member',
    'Client',
    'Viewer'
  ]
}

export async function GET(
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

    const role = await CustomRole.findOne({
      _id: params.id,
      organization: authResult.user.organization,
      isActive: true
    }).lean()

    if (!role) {
      return NextResponse.json({
        success: false,
        error: 'Role not found'
      }, { status: 404 })
    }

    const userCount = await User.countDocuments({
      customRole: (role as any)._id,
      organization: authResult.user.organization
    })

    return NextResponse.json({
      success: true,
      data: {
        ...role,
        isSystem: false,
        userCount
      }
    }, { status: 200 })

  } catch (error) {
    console.error('Error fetching role:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

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

    const body = await req.json()
    const { name, description, permissions } = body

    // Validate required fields
    if (!name || !description || !permissions || !Array.isArray(permissions)) {
      return NextResponse.json({
        success: false,
        error: 'Name, description, and permissions are required'
      }, { status: 400 })
    }

    // Validate permissions
    const validPermissions = Object.values(Permission)
    const invalidPermissions = permissions.filter(p => !validPermissions.includes(p))
    if (invalidPermissions.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Invalid permissions: ${invalidPermissions.join(', ')}`
      }, { status: 400 })
    }

    // Find the role
    const role = await CustomRole.findOne({
      _id: params.id,
      organization: authResult.user.organization,
      isActive: true
    })

    if (!role) {
      return NextResponse.json({
        success: false,
        error: 'Role not found'
      }, { status: 404 })
    }

    // Check if role name already exists in predefined roles
    const predefinedRoleNames = getPredefinedRoleNames()
    const normalizedName = name.trim()
    const isPredefinedRole = predefinedRoleNames.some(
      predefinedName => predefinedName.toLowerCase() === normalizedName.toLowerCase()
    )

    if (isPredefinedRole) {
      return NextResponse.json({
        success: false,
        error: 'Role name already exists'
      }, { status: 409 })
    }

    // Check if name already exists in custom roles (excluding current role)
    const existingRole = await CustomRole.findOne({
      name: normalizedName,
      organization: authResult.user.organization,
      isActive: true,
      _id: { $ne: params.id }
    })

    if (existingRole) {
      return NextResponse.json({
        success: false,
        error: 'Role name already exists'
      }, { status: 409 })
    }

    // Update the role
    role.name = normalizedName
    role.description = description
    role.permissions = permissions
    await role.save()

    const userCount = await User.countDocuments({
      customRole: role._id,
      organization: authResult.user.organization
    })

    return NextResponse.json({
      success: true,
      data: {
        ...role.toObject(),
        isSystem: false,
        userCount
      },
      message: 'Role updated successfully'
    }, { status: 200 })

  } catch (error) {
    console.error('Error updating role:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

export async function DELETE(
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

    // Find the role
    const role = await CustomRole.findOne({
      _id: params.id,
      organization: authResult.user.organization,
      isActive: true
    })

    if (!role) {
      return NextResponse.json({
        success: false,
        error: 'Role not found'
      }, { status: 404 })
    }

    // Check if role is in use
    const usersWithRole = await User.countDocuments({
      customRole: role._id,
      organization: authResult.user.organization
    })

    if (usersWithRole > 0) {
      return NextResponse.json({
        success: false,
        error: 'Cannot delete role that is assigned to users'
      }, { status: 409 })
    }

    // Soft delete the role
    role.isActive = false
    await role.save()

    return NextResponse.json({
      success: true,
      message: 'Role deleted successfully'
    }, { status: 200 })

  } catch (error) {
    console.error('Error deleting role:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}
