'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { X, Loader2 } from 'lucide-react'

interface Role {
  _id: string
  name: string
  description: string
}

interface InviteMemberModalProps {
  onClose: () => void
  onInvite: (data: any) => Promise<{ error?: string } | void>
}

export function InviteMemberModal({ onClose, onInvite }: InviteMemberModalProps) {
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    role: 'team_member'
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [roles, setRoles] = useState<Role[]>([])
  const [rolesLoading, setRolesLoading] = useState(true)

  useEffect(() => {
    fetchRoles()
  }, [])

  const fetchRoles = async () => {
    try {
      setRolesLoading(true)
      const response = await fetch('/api/roles')
      const data = await response.json()

      if (data.success) {
        setRoles(data.data)
      } else {
        console.error('Failed to fetch roles:', data.error)
      }
    } catch (err) {
      console.error('Failed to fetch roles:', err)
    } finally {
      setRolesLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setEmailError('')

    if (!formData.email) {
      setEmailError('Email is required')
      return
    }

    if (!formData.firstName || !formData.lastName) {
      setError('First name and last name are required')
      return
    }

    setLoading(true)
    try {
      const result = await onInvite(formData)
      // If onInvite returns an error object
      if (result && result.error) {
        const errorMessage = result.error
        // Check if it's an email-related error
        if (errorMessage.toLowerCase().includes('email') || 
            errorMessage.toLowerCase().includes('already exists') ||
            errorMessage.toLowerCase().includes('already sent') ||
            errorMessage.toLowerCase().includes('user already')) {
          setEmailError(errorMessage)
        } else {
          setError(errorMessage)
        }
      }
    } catch (err: any) {
      const errorMessage = err?.message || err?.error || 'Failed to send invitation'
      // Check if it's an email-related error
      if (errorMessage.toLowerCase().includes('email') || 
          errorMessage.toLowerCase().includes('already exists') ||
          errorMessage.toLowerCase().includes('already sent') ||
          errorMessage.toLowerCase().includes('user already')) {
        setEmailError(errorMessage)
      } else {
        setError(errorMessage)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh'
      }}
    >
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Invite Team Member</CardTitle>
              <CardDescription>
                Send an invitation to join your team
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive" className="flex items-start justify-between gap-3 pr-2">
                <AlertDescription className="flex-1">{error}</AlertDescription>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-destructive/20 flex-shrink-0"
                  onClick={() => setError('')}
                >
                  <X className="h-4 w-4" />
                </Button>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, email: e.target.value }))
                  setEmailError('') // Clear email error when user types
                }}
                placeholder="colleague@company.com"
                required
                className={emailError ? 'border-destructive' : ''}
              />
              {emailError && (
                <div className="flex items-center justify-between gap-2 p-2 bg-destructive/10 rounded-md border border-destructive/20">
                  <p className="text-sm text-destructive flex-1">{emailError}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-destructive/20 flex-shrink-0"
                    onClick={() => setEmailError('')}
                  >
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  placeholder="John"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  placeholder="Doe"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={formData.role} onValueChange={(value) => setFormData(prev => ({ ...prev, role: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {rolesLoading ? (
                    <SelectItem value="loading" disabled>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Loading roles...
                    </SelectItem>
                  ) : (
                    roles.map((role) => (
                      <SelectItem key={role._id} value={role._id}>
                        {role.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Invitation'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
