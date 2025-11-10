'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/Checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { X, Loader2, Shield } from 'lucide-react'
import { Permission, PermissionCategory } from '@/lib/permissions/permission-definitions'

interface EditRoleModalProps {
  isOpen: boolean
  onClose: () => void
  onRoleUpdated: (role: any) => void
  role: {
    _id: string
    name: string
    description: string
    permissions: string[]
    isSystem: boolean
  } | null
}

interface PermissionGroup {
  category: PermissionCategory
  permissions: { permission: Permission; label: string; description: string }[]
}

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    category: PermissionCategory.USER,
    permissions: [
      { permission: Permission.USER_CREATE, label: 'Create Users', description: 'Create new user accounts' },
      { permission: Permission.USER_READ, label: 'View Users', description: 'View user information' },
      { permission: Permission.USER_UPDATE, label: 'Edit Users', description: 'Edit user information' },
      { permission: Permission.USER_DELETE, label: 'Delete Users', description: 'Delete user accounts' },
      { permission: Permission.USER_INVITE, label: 'Invite Users', description: 'Send user invitations' },
      { permission: Permission.USER_ACTIVATE, label: 'Activate Users', description: 'Activate user accounts' },
      { permission: Permission.USER_DEACTIVATE, label: 'Deactivate Users', description: 'Deactivate user accounts' },
      { permission: Permission.USER_MANAGE_ROLES, label: 'Manage Roles', description: 'Assign and manage user roles' }
    ]
  },
  {
    category: PermissionCategory.ORGANIZATION,
    permissions: [
      { permission: Permission.ORGANIZATION_READ, label: 'View Organization', description: 'View organization information' },
      { permission: Permission.ORGANIZATION_UPDATE, label: 'Edit Organization', description: 'Edit organization settings' },
      { permission: Permission.ORGANIZATION_DELETE, label: 'Delete Organization', description: 'Delete organization' },
      { permission: Permission.ORGANIZATION_MANAGE_SETTINGS, label: 'Manage Settings', description: 'Manage organization settings' },
      { permission: Permission.ORGANIZATION_MANAGE_BILLING, label: 'Manage Billing', description: 'Manage billing and subscriptions' }
    ]
  },
  {
    category: PermissionCategory.PROJECT,
    permissions: [
      { permission: Permission.PROJECT_CREATE, label: 'Create Projects', description: 'Create new projects' },
      { permission: Permission.PROJECT_READ, label: 'View Projects', description: 'View project information' },
      { permission: Permission.PROJECT_UPDATE, label: 'Edit Projects', description: 'Edit project details' },
      { permission: Permission.PROJECT_DELETE, label: 'Delete Projects', description: 'Delete projects' },
      { permission: Permission.PROJECT_MANAGE_TEAM, label: 'Manage Team', description: 'Manage project team members' },
      { permission: Permission.PROJECT_MANAGE_BUDGET, label: 'Manage Budget', description: 'Manage project budget' },
      { permission: Permission.PROJECT_ARCHIVE, label: 'Archive Projects', description: 'Archive projects' },
      { permission: Permission.PROJECT_RESTORE, label: 'Restore Projects', description: 'Restore archived projects' },
      { permission: Permission.PROJECT_VIEW_ALL, label: 'View All Projects', description: 'View all organization projects' }
    ]
  },
  {
    category: PermissionCategory.TASK,
    permissions: [
      { permission: Permission.TASK_CREATE, label: 'Create Tasks', description: 'Create new tasks' },
      { permission: Permission.TASK_READ, label: 'View Tasks', description: 'View task information' },
      { permission: Permission.TASK_UPDATE, label: 'Edit Tasks', description: 'Edit task details' },
      { permission: Permission.TASK_DELETE, label: 'Delete Tasks', description: 'Delete tasks' },
      { permission: Permission.TASK_ASSIGN, label: 'Assign Tasks', description: 'Assign tasks to users' },
      { permission: Permission.TASK_CHANGE_STATUS, label: 'Change Status', description: 'Change task status' },
      { permission: Permission.TASK_MANAGE_COMMENTS, label: 'Manage Comments', description: 'Manage task comments' },
      { permission: Permission.TASK_MANAGE_ATTACHMENTS, label: 'Manage Attachments', description: 'Manage task attachments' }
    ]
  },
  {
    category: PermissionCategory.TEAM,
    permissions: [
      { permission: Permission.TEAM_READ, label: 'View Team', description: 'View team information' },
      { permission: Permission.TEAM_INVITE, label: 'Invite Members', description: 'Invite team members' },
      { permission: Permission.TEAM_REMOVE, label: 'Remove Members', description: 'Remove team members' },
      { permission: Permission.TEAM_MANAGE_PERMISSIONS, label: 'Manage Permissions', description: 'Manage team permissions' },
      { permission: Permission.TEAM_VIEW_ACTIVITY, label: 'View Activity', description: 'View team activity' }
    ]
  },
  {
    category: PermissionCategory.TIME_TRACKING,
    permissions: [
      { permission: Permission.TIME_TRACKING_CREATE, label: 'Create Time Entries', description: 'Create time tracking entries' },
      { permission: Permission.TIME_TRACKING_READ, label: 'View Time Entries', description: 'View time tracking data' },
      { permission: Permission.TIME_TRACKING_UPDATE, label: 'Edit Time Entries', description: 'Edit time tracking entries' },
      { permission: Permission.TIME_TRACKING_DELETE, label: 'Delete Time Entries', description: 'Delete time tracking entries' },
      { permission: Permission.TIME_TRACKING_APPROVE, label: 'Approve Time', description: 'Approve time entries' },
      { permission: Permission.TIME_TRACKING_EXPORT, label: 'Export Time', description: 'Export time tracking data' },
      { permission: Permission.TIME_TRACKING_VIEW_ALL, label: 'View All Time', description: 'View all time tracking data' }
    ]
  },
  {
    category: PermissionCategory.FINANCIAL,
    permissions: [
      { permission: Permission.FINANCIAL_READ, label: 'View Financial Data', description: 'View financial information' },
      { permission: Permission.FINANCIAL_MANAGE_BUDGET, label: 'Manage Budget', description: 'Manage project budgets' },
      { permission: Permission.FINANCIAL_CREATE_EXPENSE, label: 'Create Expenses', description: 'Create expense entries' },
      { permission: Permission.FINANCIAL_APPROVE_EXPENSE, label: 'Approve Expenses', description: 'Approve expense entries' },
      { permission: Permission.FINANCIAL_CREATE_INVOICE, label: 'Create Invoices', description: 'Create invoices' },
      { permission: Permission.FINANCIAL_SEND_INVOICE, label: 'Send Invoices', description: 'Send invoices to clients' },
      { permission: Permission.FINANCIAL_MANAGE_PAYMENTS, label: 'Manage Payments', description: 'Manage payment processing' }
    ]
  },
  {
    category: PermissionCategory.REPORTING,
    permissions: [
      { permission: Permission.REPORTING_VIEW, label: 'View Reports', description: 'View reports and analytics' },
      { permission: Permission.REPORTING_CREATE, label: 'Create Reports', description: 'Create custom reports' },
      { permission: Permission.REPORTING_EXPORT, label: 'Export Reports', description: 'Export reports to files' },
      { permission: Permission.REPORTING_SHARE, label: 'Share Reports', description: 'Share reports with others' }
    ]
  },
  {
    category: PermissionCategory.SETTINGS,
    permissions: [
      { permission: Permission.SETTINGS_READ, label: 'View Settings', description: 'View system settings' },
      { permission: Permission.SETTINGS_UPDATE, label: 'Edit Settings', description: 'Edit system settings' },
      { permission: Permission.SETTINGS_MANAGE_EMAIL, label: 'Manage Email', description: 'Manage email settings' },
      { permission: Permission.SETTINGS_MANAGE_DATABASE, label: 'Manage Database', description: 'Manage database settings' },
      { permission: Permission.SETTINGS_MANAGE_SECURITY, label: 'Manage Security', description: 'Manage security settings' }
    ]
  }
]

export function EditRoleModal({ isOpen, onClose, onRoleUpdated, role }: EditRoleModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    permissions: [] as string[]
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<PermissionCategory>>(new Set())

  useEffect(() => {
    if (isOpen && role) {
      setFormData({
        name: role.name,
        description: role.description,
        permissions: role.permissions
      })
      setError('')
      setExpandedCategories(new Set())
    }
  }, [isOpen, role])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.name.trim()) {
      setError('Role name is required')
      return
    }

    if (!formData.description.trim()) {
      setError('Role description is required')
      return
    }

    if (formData.permissions.length === 0) {
      setError('At least one permission must be selected')
      return
    }

    if (!role) return

    setLoading(true)
    try {
      const response = await fetch(`/api/roles/${role._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (data.success) {
        onRoleUpdated(data.data)
        onClose()
      } else {
        setError(data.error || 'Failed to update role')
      }
    } catch (err) {
      setError('Failed to update role')
    } finally {
      setLoading(false)
    }
  }

  const handlePermissionChange = (permission: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      permissions: checked
        ? [...prev.permissions, permission]
        : prev.permissions.filter(p => p !== permission)
    }))
  }

  const handleCategoryToggle = (category: PermissionCategory) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
    }
    setExpandedCategories(newExpanded)
  }

  const handleSelectAll = (category: PermissionCategory) => {
    const group = PERMISSION_GROUPS.find(g => g.category === category)
    if (!group) return

    const allSelected = group.permissions.every(p => formData.permissions.includes(p.permission))
    
    if (allSelected) {
      // Deselect all in this category
      setFormData(prev => ({
        ...prev,
        permissions: prev.permissions.filter(p => !group.permissions.some(gp => gp.permission === p))
      }))
    } else {
      // Select all in this category
      const categoryPermissions = group.permissions.map(p => p.permission)
      setFormData(prev => ({
        ...prev,
        permissions: Array.from(new Set([...prev.permissions, ...categoryPermissions]))
      }))
    }
  }

  if (!isOpen || !role) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden m-4 sm:m-6">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0 pb-3 sm:pb-4 px-4 sm:px-6 pt-4 sm:pt-6 flex-shrink-0">
          <div>
            <CardTitle className="text-xl font-semibold">Edit Role</CardTitle>
            <CardDescription>
              Update the role permissions and settings
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4">
          <form onSubmit={handleSubmit} className="space-y-6" id="edit-role-form">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Role Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter role name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe what this role can do"
                  rows={3}
                  required
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Permissions</Label>
                <div className="text-sm text-muted-foreground">
                  {formData.permissions.length} permission{formData.permissions.length !== 1 ? 's' : ''} selected
                </div>
              </div>

              <div className="space-y-3">
                {PERMISSION_GROUPS.map((group) => {
                  const isExpanded = expandedCategories.has(group.category)
                  const selectedCount = group.permissions.filter(p => formData.permissions.includes(p.permission)).length
                  const allSelected = selectedCount === group.permissions.length

                  return (
                    <div key={group.category} className="border rounded-lg">
                      <div
                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50"
                        onClick={() => handleCategoryToggle(group.category)}
                      >
                        <div className="flex items-center space-x-2">
                          <Shield className="h-4 w-4" />
                          <span className="font-medium capitalize">
                            {group.category.replace('_', ' ')} Permissions
                          </span>
                          <span className="text-sm text-muted-foreground">
                            ({selectedCount}/{group.permissions.length})
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSelectAll(group.category)
                            }}
                          >
                            {allSelected ? 'Deselect All' : 'Select All'}
                          </Button>
                          <span className="text-muted-foreground">
                            {isExpanded ? '▼' : '▶'}
                          </span>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t p-3 space-y-2">
                          {group.permissions.map((permission) => (
                            <div key={permission.permission} className="flex items-start space-x-3">
                              <Checkbox
                                id={permission.permission}
                                checked={formData.permissions.includes(permission.permission)}
                                onCheckedChange={(checked) =>
                                  handlePermissionChange(permission.permission, checked as boolean)
                                }
                              />
                              <div className="flex-1">
                                <Label
                                  htmlFor={permission.permission}
                                  className="text-sm font-medium cursor-pointer"
                                >
                                  {permission.label}
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                  {permission.description}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

          </form>
        </CardContent>
        <div className="flex-shrink-0 px-4 sm:px-6 pb-4 sm:pb-6 pt-3 sm:pt-4 border-t">
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-0 sm:space-x-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="edit-role-form" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Role'
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
