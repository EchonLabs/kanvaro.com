'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { X, Loader2 } from 'lucide-react'

interface Member {
  _id: string
  firstName: string
  lastName: string
  email: string
  role: string
  customRole?: {
    _id: string
    name: string
  }
  isActive: boolean
}

interface CustomRole {
  _id: string
  name: string
  description: string
}

interface EditMemberModalProps {
  member: Member
  onClose: () => void
  onUpdate: (memberId: string, updates: any) => void
}

export function EditMemberModal({ member, onClose, onUpdate }: EditMemberModalProps) {
  const [formData, setFormData] = useState({
    firstName: member.firstName,
    lastName: member.lastName,
    role: member.role,
    customRoleId: member.customRole?._id || '',
    isActive: member.isActive
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([])
  const [rolesLoading, setRolesLoading] = useState(true)

  useEffect(() => {
    fetchCustomRoles()
  }, [])

  const fetchCustomRoles = async () => {
    try {
      setRolesLoading(true)
      const response = await fetch('/api/roles')
      const data = await response.json()

      if (data.success) {
        // Filter out system roles and get only custom roles
        const customRolesData = data.data.filter((role: any) => !role.isSystem)
        setCustomRoles(customRolesData)
      }
    } catch (err) {
      console.error('Failed to fetch custom roles:', err)
    } finally {
      setRolesLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.firstName || !formData.lastName) {
      setError('First name and last name are required')
      return
    }

    setLoading(true)
    try {
      // Update member basic info
      await onUpdate(member._id, {
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
        isActive: formData.isActive
      })

      // Update custom role if changed
      if (formData.customRoleId !== (member.customRole?._id || '')) {
        const response = await fetch(`/api/users/${member._id}/role`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            customRoleId: formData.customRoleId || null
          })
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to update custom role')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update member')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <Card className="w-full max-w-md max-h-[90vh] flex flex-col m-4 sm:m-0">
        <CardHeader className="flex-shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-xl sm:text-2xl truncate">Edit Team Member</CardTitle>
              <CardDescription className="text-sm sm:text-base mt-1">
                Update member information and permissions
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} className="flex-shrink-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4">
          <form onSubmit={handleSubmit} className="space-y-4" id="edit-member-form">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={member.email}
                disabled
                className="bg-gray-50 w-full"
              />
              <p className="text-xs text-gray-500">Email cannot be changed</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  required
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  required
                  className="w-full"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">System Role</Label>
              <Select value={formData.role} onValueChange={(value) => setFormData(prev => ({ ...prev, role: value }))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="project_manager">Project Manager</SelectItem>
                  <SelectItem value="team_member">Team Member</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customRole">Custom Role (Optional)</Label>
              <Select 
                value={formData.customRoleId || '__NO_CUSTOM_ROLE__'} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, customRoleId: value === '__NO_CUSTOM_ROLE__' ? '' : value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a custom role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__NO_CUSTOM_ROLE__">No custom role</SelectItem>
                  {rolesLoading ? (
                    <SelectItem value="loading" disabled>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Loading roles...
                    </SelectItem>
                  ) : (
                    customRoles.map((role) => (
                      <SelectItem key={role._id} value={role._id}>
                        {role.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Custom roles provide additional permissions beyond the system role
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-0.5 flex-1 min-w-0">
                <Label htmlFor="isActive">Active Status</Label>
                <p className="text-xs sm:text-sm text-gray-500">
                  {formData.isActive ? 'Member can access the system' : 'Member cannot access the system'}
                </p>
              </div>
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
                className="flex-shrink-0"
              />
            </div>
          </form>
        </CardContent>
        <div className="flex-shrink-0 px-4 sm:px-6 pb-4 sm:pb-6 pt-3 sm:pt-4 border-t flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-0 sm:space-x-2">
          <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto" form="edit-member-form">
            Cancel
          </Button>
          <Button type="submit" disabled={loading} className="w-full sm:w-auto" form="edit-member-form">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              'Update Member'
            )}
          </Button>
        </div>
      </Card>
    </div>
  )
}
