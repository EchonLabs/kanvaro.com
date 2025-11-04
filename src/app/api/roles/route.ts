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

export async function GET(req: NextRequest) {
  try {
    await connectDB()
    
    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    // Get system roles (predefined)
    const systemRoles = [
      {
        _id: 'admin',
        name: 'Administrator',
        description: 'Full access to all features and settings',
        permissions: [
          'user:create',
          'user:read',
          'user:update',
          'user:delete',
          'project:create',
          'project:read',
          'project:update',
          'project:delete',
          'team:read',
          'team:manage',
          'settings:read',
          'settings:update',
          'reports:read',
          'reports:export'
        ],
        isSystem: true,
        userCount: 1,
        createdAt: new Date().toISOString()
      },
      {
        _id: 'project_manager',
        name: 'Project Manager',
        description: 'Can manage projects and assign tasks to team members',
        permissions: [
          'project:create',
          'project:read',
          'project:update',
          'task:create',
          'task:read',
          'task:update',
          'task:delete',
          'team:read',
          'reports:read'
        ],
        isSystem: true,
        userCount: 0,
        createdAt: new Date().toISOString()
      },
      {
        _id: 'team_member',
        name: 'Team Member',
        description: 'Can work on assigned tasks and projects',
        permissions: [
          'project:read',
          'task:create',
          'task:read',
          'task:update',
          'time:create',
          'time:read',
          'time:update'
        ],
        isSystem: true,
        userCount: 0,
        createdAt: new Date().toISOString()
      },
      {
        _id: 'client',
        name: 'Client',
        description: 'Read-only access to assigned projects',
        permissions: [
          'project:read',
          'task:read',
          'reports:read'
        ],
        isSystem: true,
        userCount: 0,
        createdAt: new Date().toISOString()
      },
      {
        _id: 'viewer',
        name: 'Viewer',
        description: 'Read-only access to assigned content',
        permissions: [
          'project:read',
          'task:read'
        ],
        isSystem: true,
        userCount: 0,
        createdAt: new Date().toISOString()
      }
    ]

    // Get custom roles from database
    const customRoles = await CustomRole.find({ 
      organization: authResult.user.organization,
      isActive: true 
    }).lean()

    // Get user counts for custom roles
    const customRolesWithCounts = await Promise.all(
      customRoles.map(async (role) => {
        const userCount = await User.countDocuments({ 
          customRole: role._id,
          organization: authResult.user.organization 
        })
        return {
          ...role,
          userCount,
          isSystem: false
        }
      })
    )

    const allRoles = [...systemRoles, ...customRolesWithCounts]

    return NextResponse.json({ 
      success: true, 
      data: allRoles 
    }, { status: 200 })
  } catch (error) {
    console.error('Error fetching roles:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
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

    // Check if role name already exists in active custom roles
    const existingActiveRole = await CustomRole.findOne({
      name: normalizedName,
      organization: authResult.user.organization,
      isActive: true
    })

    if (existingActiveRole) {
      return NextResponse.json({
        success: false,
        error: 'Role name already exists'
      }, { status: 409 })
    }

    // Check if there's an inactive (deleted) role with the same name
    // If so, permanently delete it to allow reuse of the name
    const existingInactiveRole = await CustomRole.findOne({
      name: normalizedName,
      organization: authResult.user.organization,
      isActive: false
    })

    if (existingInactiveRole) {
      // Permanently delete the inactive role to allow reuse of the name
      await CustomRole.deleteOne({ _id: existingInactiveRole._id })
    }

    // Create new custom role
    const customRole = new CustomRole({
      name: normalizedName,
      description,
      permissions,
      organization: authResult.user.organization,
      createdBy: authResult.user.id,
      isActive: true
    })

    await customRole.save()

    return NextResponse.json({
      success: true,
      data: {
        ...customRole.toObject(),
        isSystem: false,
        userCount: 0
      },
      message: 'Custom role created successfully'
    }, { status: 201 })

  } catch (error: any) {
    console.error('Error creating role:', error)
    
    // Handle MongoDB duplicate key error
    if (error.code === 11000 || error.code === '11000') {
      // Check if it's due to a deleted role that wasn't cleaned up
      const existingInactiveRole = await CustomRole.findOne({
        name: name.trim(),
        organization: authResult.user.organization,
        isActive: false
      })

      if (existingInactiveRole) {
        // Try to permanently delete the inactive role and create again
        try {
          await CustomRole.deleteOne({ _id: existingInactiveRole._id })
          
          // Retry creating the role
          const customRole = new CustomRole({
            name: name.trim(),
            description,
            permissions,
            organization: authResult.user.organization,
            createdBy: authResult.user.id,
            isActive: true
          })

          await customRole.save()

          return NextResponse.json({
            success: true,
            data: {
              ...customRole.toObject(),
              isSystem: false,
              userCount: 0
            },
            message: 'Custom role created successfully'
          }, { status: 201 })
        } catch (retryError: any) {
          console.error('Error retrying role creation:', retryError)
          return NextResponse.json({
            success: false,
            error: 'Failed to create role. Please try again.'
          }, { status: 500 })
        }
      }

      return NextResponse.json({
        success: false,
        error: 'Role name already exists'
      }, { status: 409 })
    }

    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}
