'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CreateRoleModal } from '@/components/roles/CreateRoleModal'
import { EditRoleModal } from '@/components/roles/EditRoleModal'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { 
  Shield, 
  Plus, 
  Edit, 
  Trash2, 
  Users,
  Loader2,
  CheckCircle
} from 'lucide-react'

interface Role {
  _id: string
  name: string
  description: string
  permissions: string[]
  isSystem: boolean
  userCount: number
  createdAt: string
}

export default function RolesPage() {
  const router = useRouter()
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [authError, setAuthError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      
      if (response.ok) {
        setAuthError('')
        await fetchRoles()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          setAuthError('')
          await fetchRoles()
        } else {
          setAuthError('Session expired')
          setTimeout(() => {
            router.push('/login')
          }, 2000)
        }
      } else {
        router.push('/login')
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      setAuthError('Authentication failed')
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    }
  }, [router])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const fetchRoles = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/roles')
      const data = await response.json()

      if (data.success) {
        setRoles(data.data)
        setError('')
      } else {
        setError(data.error || 'Failed to fetch roles')
      }
    } catch (err) {
      setError('Failed to fetch roles')
    } finally {
      setLoading(false)
    }
  }

  const handleRoleCreated = (newRole: Role) => {
    setRoles(prev => [...prev, newRole])
    setShowCreateModal(false)
    setSuccess('Role created successfully')
    setError('')
    setTimeout(() => setSuccess(''), 3000)
  }

  const handleEditRole = (role: Role) => {
    setSelectedRole(role)
    setShowEditModal(true)
  }

  const handleRoleUpdated = (updatedRole: Role) => {
    setRoles(prev => prev.map(role => role._id === updatedRole._id ? updatedRole : role))
    setShowEditModal(false)
    setSelectedRole(null)
    setSuccess('Role updated successfully')
    setError('')
    setTimeout(() => setSuccess(''), 3000)
  }

  const handleDeleteClick = (role: Role) => {
    if (role.isSystem) {
      setError('Cannot delete system roles')
      return
    }

    if (role.userCount > 0) {
      setError('Cannot delete role that is assigned to users')
      return
    }

    setRoleToDelete(role)
    setShowDeleteConfirm(true)
  }

  const handleDeleteRole = async () => {
    if (!roleToDelete) return

    try {
      setIsDeleting(true)
      setError('')
      
      const response = await fetch(`/api/roles/${roleToDelete._id}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        setRoles(prev => prev.filter(r => r._id !== roleToDelete._id))
        setError('')
        setSuccess('Role deleted successfully')
        setShowDeleteConfirm(false)
        setRoleToDelete(null)
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(data.error || 'Failed to delete role')
      }
    } catch (err) {
      setError('Failed to delete role')
    } finally {
      setIsDeleting(false)
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading roles...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (authError) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-destructive mb-4">{authError}</p>
            <p className="text-muted-foreground">Redirecting to login...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-8 sm:space-y-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Roles & Permissions</h1>
            <p className="text-muted-foreground">Manage user roles and their permissions</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Role
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert variant="success">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6">
          {roles.map((role) => (
            <Card key={role._id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Shield className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-lg">{role.name}</CardTitle>
                      <CardDescription>{role.description}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={role.isSystem ? "secondary" : "outline"}>
                      {role.isSystem ? "System" : "Custom"}
                    </Badge>
                    <Badge variant="outline">
                      <Users className="h-3 w-3 mr-1" />
                      {role.userCount} users
                    </Badge>
                    {!role.isSystem && (
                      <div className="flex space-x-1">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleEditRole(role)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDeleteClick(role)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-foreground">Permissions:</h4>
                  <div className="flex flex-wrap gap-2">
                    {role.permissions.map((permission) => (
                      <Badge key={permission} variant="outline" className="text-xs">
                        {permission}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {roles.length === 0 && !loading && (
          <Card>
            <CardContent className="text-center py-8">
              <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No roles found</h3>
              <p className="text-muted-foreground mb-4">Get started by creating your first custom role.</p>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Role
              </Button>
            </CardContent>
          </Card>
        )}

        <CreateRoleModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onRoleCreated={handleRoleCreated}
        />

        <EditRoleModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false)
            setSelectedRole(null)
          }}
          onRoleUpdated={handleRoleUpdated}
          role={selectedRole}
        />

        <ConfirmationModal
          isOpen={showDeleteConfirm}
          onClose={() => {
            setShowDeleteConfirm(false)
            setRoleToDelete(null)
          }}
          onConfirm={handleDeleteRole}
          title="Delete Role"
          description={`Are you sure you want to delete the role "${roleToDelete?.name}"? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          variant="destructive"
          isLoading={isDeleting}
        />
      </div>
    </MainLayout>
  )
}
