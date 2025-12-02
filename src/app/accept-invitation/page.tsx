'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'
import { PasswordStrength } from '@/components/ui/PasswordStrength'
import { Loader2, CheckCircle, Eye, EyeOff, Info } from 'lucide-react'

interface InvitationData {
  email: string
  role: string
  customRole?: string
  roleDisplayName?: string
  organization: string
  invitedBy: string
}

interface FieldErrors {
  firstName?: string
  lastName?: string
  password?: string
  confirmPassword?: string
}

interface TouchedFields {
  firstName: boolean
  lastName: boolean
  password: boolean
  confirmPassword: boolean
}

function AcceptInvitationContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [invitationData, setInvitationData] = useState<InvitationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: ''
  })

  const [touched, setTouched] = useState<TouchedFields>({
    firstName: false,
    lastName: false,
    password: false,
    confirmPassword: false
  })

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  useEffect(() => {
    if (token) {
      validateInvitation()
    } else {
      setError('Invalid invitation link')
      setLoading(false)
    }
  }, [token])

  // Re-validate confirmPassword when password changes
  useEffect(() => {
    if (touched.confirmPassword && formData.confirmPassword) {
      const confirmError = validateField('confirmPassword', formData.confirmPassword, formData.password)
      setFieldErrors(prev => ({
        ...prev,
        confirmPassword: confirmError
      }))
    }
  }, [formData.password, formData.confirmPassword, touched.confirmPassword])

  const validateInvitation = async () => {
    try {
      const response = await fetch(`/api/members/validate-invitation?token=${token}`)
      const data = await response.json()

      if (data.success) {
        setInvitationData(data.data)
        setFormData(prev => ({
          ...prev,
          firstName: data.data.firstName || '',
          lastName: data.data.lastName || ''
        }))
      } else {
        setError(data.error || 'Invalid invitation')
      }
    } catch (err) {
      setError('Failed to validate invitation')
    } finally {
      setLoading(false)
    }
  }

  const validateField = (name: keyof typeof formData, value: string, currentPassword?: string): string | undefined => {
    switch (name) {
      case 'firstName':
        if (!value.trim()) {
          return 'First name is required'
        }
        if (value.trim().length < 2) {
          return 'First name must be at least 2 characters'
        }
        return undefined
      
      case 'lastName':
        if (!value.trim()) {
          return 'Last name is required'
        }
        if (value.trim().length < 2) {
          return 'Last name must be at least 2 characters'
        }
        return undefined
      
      case 'password':
        if (!value) {
          return 'Password is required'
        }
        if (value.length < 8) {
          return 'Password must be at least 8 characters long'
        }
        const hasLowercase = /[a-z]/.test(value)
        const hasUppercase = /[A-Z]/.test(value)
        const hasNumber = /\d/.test(value)
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(value)
        
        if (!hasLowercase || !hasUppercase || !hasNumber || !hasSpecialChar) {
          return 'Password must contain uppercase, lowercase, number, and special character'
        }
        return undefined
      
      case 'confirmPassword':
        if (!value) {
          return 'Please confirm your password'
        }
        const passwordToCompare = currentPassword !== undefined ? currentPassword : formData.password
        if (value !== passwordToCompare) {
          return 'Passwords do not match'
        }
        return undefined
      
      default:
        return undefined
    }
  }

  const validateForm = (): boolean => {
    const errors: FieldErrors = {}
    
    errors.firstName = validateField('firstName', formData.firstName)
    errors.lastName = validateField('lastName', formData.lastName)
    errors.password = validateField('password', formData.password)
    errors.confirmPassword = validateField('confirmPassword', formData.confirmPassword)
    
    setFieldErrors(errors)
    
    return !errors.firstName && !errors.lastName && !errors.password && !errors.confirmPassword
  }

  const isFormValid = (): boolean => {
    return (
      formData.firstName.trim().length >= 2 &&
      formData.lastName.trim().length >= 2 &&
      formData.password.length >= 8 &&
      formData.password === formData.confirmPassword &&
      /[a-z]/.test(formData.password) &&
      /[A-Z]/.test(formData.password) &&
      /\d/.test(formData.password) &&
      /[!@#$%^&*(),.?":{}|<>]/.test(formData.password)
    )
  }

  const handleFieldChange = (name: keyof typeof formData, value: string) => {
    // Clear general error when user starts typing
    if (error) {
      setError('')
    }
    
    // Update form data
    setFormData(prev => ({ ...prev, [name]: value }))
    
    // Validate field if it has been touched
    if (touched[name]) {
      const fieldError = validateField(name, value, name === 'password' ? value : formData.password)
      setFieldErrors(prev => ({
        ...prev,
        [name]: fieldError
      }))
    }
  }

  const handleFieldBlur = (name: keyof typeof formData) => {
    setTouched(prev => ({ ...prev, [name]: true }))
    const fieldError = validateField(name, formData[name])
    setFieldErrors(prev => ({
      ...prev,
      [name]: fieldError
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Mark all fields as touched
    setTouched({
      firstName: true,
      lastName: true,
      password: true,
      confirmPassword: true
    })

    // Validate entire form
    if (!validateForm()) {
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch('/api/members/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token,
          firstName: formData.firstName,
          lastName: formData.lastName,
          password: formData.password
        })
      })

      const data = await response.json()

      if (data.success) {
        setSuccess(true)
        // Don't auto-redirect - let user click Sign In button manually
      } else {
        setError(data.error || 'Failed to accept invitation')
      }
    } catch (err) {
      setError('Failed to accept invitation')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center space-x-2 text-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span>Validating invitation...</span>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="pt-6">
            <div className="text-center">
              <CheckCircle className="h-16 w-16 text-green-600 dark:text-green-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-foreground mb-2">Welcome to the team!</h2>
              <p className="text-muted-foreground mb-4">
                Your account has been created successfully. You can now sign in to your account.
              </p>
              <Button onClick={() => router.push('/login')} className="w-full">
                Sign In
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error && !invitationData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="pt-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground mb-2">Invalid Invitation</h2>
              <p className="text-muted-foreground mb-4">{error}</p>
              <Button onClick={() => router.push('/login')} variant="outline" className="w-full">
                Go to Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <CheckCircle className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Accept Invitation</h1>
          <p className="text-muted-foreground">
            You've been invited to join <span className="font-semibold text-foreground">{invitationData?.organization}</span> as a <span className="font-semibold text-primary">{invitationData?.roleDisplayName || invitationData?.role?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
          </p>
        </div>
        
        <Card className="shadow-lg border-0 bg-card/50 backdrop-blur-sm">
          <CardContent className="pt-6 pb-6 px-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <Alert variant="destructive" className="mb-4">
                  {error}
                </Alert>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-sm font-medium">
                    First Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="firstName"
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => handleFieldChange('firstName', e.target.value)}
                    onBlur={() => handleFieldBlur('firstName')}
                    required
                    className={`h-11 ${touched.firstName && fieldErrors.firstName ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    aria-invalid={touched.firstName && !!fieldErrors.firstName}
                    aria-describedby={touched.firstName && fieldErrors.firstName ? 'firstName-error' : undefined}
                  />
                  {touched.firstName && fieldErrors.firstName && (
                    <p id="firstName-error" className="text-sm text-destructive mt-1">
                      {fieldErrors.firstName}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-sm font-medium">
                    Last Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="lastName"
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => handleFieldChange('lastName', e.target.value)}
                    onBlur={() => handleFieldBlur('lastName')}
                    required
                    className={`h-11 ${touched.lastName && fieldErrors.lastName ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    aria-invalid={touched.lastName && !!fieldErrors.lastName}
                    aria-describedby={touched.lastName && fieldErrors.lastName ? 'lastName-error' : undefined}
                  />
                  {touched.lastName && fieldErrors.lastName && (
                    <p id="lastName-error" className="text-sm text-destructive mt-1">
                      {fieldErrors.lastName}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => handleFieldChange('password', e.target.value)}
                    onBlur={() => handleFieldBlur('password')}
                    required
                    minLength={8}
                    className={`h-11 pr-10 ${touched.password && fieldErrors.password ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    placeholder="Create a strong password"
                    aria-invalid={touched.password && !!fieldErrors.password}
                    aria-describedby={touched.password && fieldErrors.password ? 'password-error' : undefined}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                {touched.password && fieldErrors.password && (
                  <p id="password-error" className="text-sm text-destructive mt-1">
                    {fieldErrors.password}
                  </p>
                )}
                <div className="mt-2 p-3 bg-muted/50 border border-border rounded-md">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs font-medium text-foreground mb-1.5">Password Requirements:</p>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        <li className="flex items-center gap-1.5">
                          <span className={formData.password.length >= 8 ? 'text-green-600 dark:text-green-400' : ''}>
                            {formData.password.length >= 8 ? '✓' : '•'}
                          </span>
                          At least 8 characters long
                        </li>
                        <li className="flex items-center gap-1.5">
                          <span className={/[a-z]/.test(formData.password) ? 'text-green-600 dark:text-green-400' : ''}>
                            {/[a-z]/.test(formData.password) ? '✓' : '•'}
                          </span>
                          Contains lowercase letter
                        </li>
                        <li className="flex items-center gap-1.5">
                          <span className={/[A-Z]/.test(formData.password) ? 'text-green-600 dark:text-green-400' : ''}>
                            {/[A-Z]/.test(formData.password) ? '✓' : '•'}
                          </span>
                          Contains uppercase letter
                        </li>
                        <li className="flex items-center gap-1.5">
                          <span className={/\d/.test(formData.password) ? 'text-green-600 dark:text-green-400' : ''}>
                            {/\d/.test(formData.password) ? '✓' : '•'}
                          </span>
                          Contains number
                        </li>
                        <li className="flex items-center gap-1.5">
                          <span className={/[!@#$%^&*(),.?":{}|<>]/.test(formData.password) ? 'text-green-600 dark:text-green-400' : ''}>
                            {/[!@#$%^&*(),.?":{}|<>]/.test(formData.password) ? '✓' : '•'}
                          </span>
                          Contains special character (!@#$%^&*...)
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
                <PasswordStrength password={formData.password} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium">
                  Confirm Password <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={(e) => handleFieldChange('confirmPassword', e.target.value)}
                    onBlur={() => handleFieldBlur('confirmPassword')}
                    required
                    minLength={8}
                    className={`h-11 pr-10 ${touched.confirmPassword && fieldErrors.confirmPassword ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    placeholder="Confirm your password"
                    aria-invalid={touched.confirmPassword && !!fieldErrors.confirmPassword}
                    aria-describedby={touched.confirmPassword && fieldErrors.confirmPassword ? 'confirmPassword-error' : undefined}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                {touched.confirmPassword && fieldErrors.confirmPassword && (
                  <p id="confirmPassword-error" className="text-sm text-destructive mt-1">
                    {fieldErrors.confirmPassword}
                  </p>
                )}
              </div>

              <div className="pt-2">
                <Button 
                  type="submit" 
                  className="w-full h-11" 
                  disabled={submitting || !isFormValid()}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Account...
                    </>
                  ) : (
                    'Accept Invitation'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-foreground">Loading...</span>
        </div>
      </div>
    }>
      <AcceptInvitationContent />
    </Suspense>
  )
}
