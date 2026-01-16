'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/Badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/Progress'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { useCurrencies } from '@/hooks/useCurrencies'
import { useOrganization } from '@/hooks/useOrganization'
import { useNotify } from '@/lib/notify'
import { formatToTitleCase } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  ArrowLeft,
  ArrowRight,
  Save,
  Users,
  Calendar,
  DollarSign,
  Settings,
  CheckCircle,
  AlertTriangle,
  Info,
  Loader2,
  Search,
  X,
  Plus,
  User,
  Mail,
  Shield,
  UserPlus,
  Paperclip,
  Link as LinkIcon,
  Upload,
  File,
  Image,
  Trash2,
  ExternalLink
} from 'lucide-react'

interface ProjectFormData {
  // Basic Information
  name: string
  description: string
  status: 'draft' | 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  projectNumber?: number
  isBillableByDefault: boolean

  // Timeline
  startDate: string
  endDate: string

  // Budget
  budget: {
    total: number
    currency: string
    defaultHourlyRate?: number
    categories: {
      materials: number
      overhead: number
    }
  }

  // Team
  teamMembers: Array<{
    memberId: string
    hourlyRate?: number
  }>
  clients: string[]

  // Settings
  settings: {
    allowTimeTracking: boolean
    allowManualTimeSubmission: boolean
    allowExpenseTracking: boolean
    requireApproval: boolean
    notifications: {
      taskUpdates: boolean
      budgetAlerts: boolean
      deadlineReminders: boolean
    }
  }

  // Tags and Custom Fields
  tags: string[]
  customFields: Record<string, any>

  // Attachments
  attachments: Array<{
    name: string
    url: string
    size: number
    type: string
    uploadedAt: string
    uploadedByName?: string
    uploadedById?: string
  }>

  // External Links
  externalLinks: {
    figma: string[]
    documentation: string[]
  }
}

export default function CreateProjectPage() {
  const router = useRouter()
  const { currencies, loading: currenciesLoading, formatCurrencyDisplay, error: currenciesError } = useCurrencies(true)
  const { organization } = useOrganization()
  const { success: notifySuccess, error: notifyError } = useNotify()

  // Debug organization time tracking settings
  const { formatDate } = useDateTime()
  const orgCurrency = organization?.currency || 'USD'
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [materialsInput, setMaterialsInput] = useState('')
const [overheadInput, setOverheadInput] = useState('')

  const [availableMembers, setAvailableMembers] = useState<any[]>([])
  const [memberSearchQuery, setMemberSearchQuery] = useState('')
  const [clientSearchQuery, setClientSearchQuery] = useState('')
  const [showMemberSearch, setShowMemberSearch] = useState(false)
  const [showClientSearch, setShowClientSearch] = useState(false)
  const [memberHourlyRates, setMemberHourlyRates] = useState<Record<string, string>>({})
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const [attachmentsPage, setAttachmentsPage] = useState(1)
  const attachmentsPerPage = 10
  const [figmaLinksPage, setFigmaLinksPage] = useState(1)
  const [docLinksPage, setDocLinksPage] = useState(1)
  const linkPaginationSize = 5
  const [currentUser, setCurrentUser] = useState<{ firstName: string; lastName: string; email: string; id: string } | null>(null)
  const [newFigmaLink, setNewFigmaLink] = useState('')
  const [newDocLink, setNewDocLink] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [globalTimeTrackingSettings, setGlobalTimeTrackingSettings] = useState<any>(null)

  // Edit mode state
  const searchParams = useSearchParams()
  const editProjectId = searchParams.get('edit')
  const isEditMode = !!editProjectId

  const [formData, setFormData] = useState<ProjectFormData>({
    name: '',
    description: '',
    status: 'planning',
    priority: 'medium',
    projectNumber: undefined,
    isBillableByDefault: true,
    startDate: '',
    endDate: '',
    budget: {
      total: 0,
      currency: orgCurrency,
      defaultHourlyRate: organization?.settings?.timeTracking?.defaultHourlyRate || 0,
      categories: {
        materials: 0,
        overhead: 0
      }
    },
    teamMembers: [],
    clients: [],
    settings: {
      allowTimeTracking: true,
      allowManualTimeSubmission: true,
      allowExpenseTracking: true,
      requireApproval: false,
      notifications: {
        taskUpdates: true,
        budgetAlerts: true,
        deadlineReminders: true
      }
    },
    tags: [],
    customFields: {},
    attachments: [],
    externalLinks: {
      figma: [],
      documentation: []
    }
  })
  const [budgetTotalInput, setBudgetTotalInput] = useState('0')
  const figmaLinks = formData.externalLinks?.figma ?? []
  const documentationLinks = formData.externalLinks?.documentation ?? []
  const figmaTotalPages = Math.max(1, Math.ceil(figmaLinks.length / linkPaginationSize))
  const documentationTotalPages = Math.max(1, Math.ceil(documentationLinks.length / linkPaginationSize))
  const currentFigmaPage = Math.min(Math.max(figmaLinksPage, 1), figmaTotalPages)
  const currentDocumentationPage = Math.min(Math.max(docLinksPage, 1), documentationTotalPages)
  const figmaSliceStart = (currentFigmaPage - 1) * linkPaginationSize
  const docSliceStart = (currentDocumentationPage - 1) * linkPaginationSize
  const paginatedFigmaLinks = figmaLinks.slice(figmaSliceStart, figmaSliceStart + linkPaginationSize)
  const paginatedDocumentationLinks = documentationLinks.slice(docSliceStart, docSliceStart + linkPaginationSize)
  const figmaShowingStart = figmaLinks.length ? figmaSliceStart + 1 : 0
  const figmaShowingEnd = figmaLinks.length ? Math.min(figmaSliceStart + linkPaginationSize, figmaLinks.length) : 0
  const documentationShowingStart = documentationLinks.length ? docSliceStart + 1 : 0
  const documentationShowingEnd = documentationLinks.length ? Math.min(docSliceStart + linkPaginationSize, documentationLinks.length) : 0

  const steps = [
    { id: 1, title: 'Basic Information', description: 'Project name and description' },
    { id: 2, title: 'Timeline', description: 'Start and end dates' },
    { id: 3, title: 'Budget', description: 'Budget allocation and categories' },
    { id: 4, title: 'Team', description: 'Team members and clients' },
    { id: 5, title: 'Attachments', description: 'Upload files and add external links' },
    { id: 6, title: 'Settings', description: 'Project settings and preferences' },
    { id: 7, title: 'Review', description: 'Review and create project' }
  ]

  const getStatusBadgeStyles = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-amber-100 text-amber-800'
      case 'planning':
        return 'bg-blue-100 text-blue-800'
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'on_hold':
        return 'bg-yellow-100 text-yellow-800'
      case 'completed':
        return 'bg-gray-100 text-gray-800'
      case 'cancelled':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-muted text-foreground'
    }
  }

  // Validate current step before proceeding
  const validateCurrentStep = () => {
    const errors: Record<string, string> = {}

    switch (currentStep) {
      case 1: // Basic Information
        if (!formData.name.trim()) {
          errors.name = 'Project Name is required'
        }
        break
      case 2: // Timeline
        if (!formData.startDate) {
          errors.startDate = 'Start Date is required'
        }
        if (formData.startDate && formData.endDate) {
          const startDate = new Date(formData.startDate)
          const endDate = new Date(formData.endDate)

          // Reset time to compare dates only
          startDate.setHours(0, 0, 0, 0)
          endDate.setHours(0, 0, 0, 0)

          if (endDate <= startDate) {
            errors.endDate = 'End date must be after the start date'
            if (endDate < startDate) {
              errors.startDate = 'Start date cannot be after end date'
            }
          }
        }
        break
      // Steps 3, 4, 5 are optional - no validation needed
      default:
        break
    }

    // Update validation errors
    if (Object.keys(errors).length > 0) {
      setValidationErrors(prev => ({ ...prev, ...errors }))
      // Show error message
      setError('Please fill in all required fields before proceeding')
      // Scroll to first error field
      setTimeout(() => {
        const firstErrorField = Object.keys(errors)[0]
        const element = document.getElementById(firstErrorField)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          element.focus()
        }
      }, 100)
      return false
    }

    // Clear step-specific errors if validation passes
    setValidationErrors(prev => {
      const newErrors = { ...prev }
      Object.keys(errors).forEach(key => {
        if (newErrors[key as keyof typeof newErrors]) {
          delete newErrors[key as keyof typeof newErrors]
        }
      })
      return newErrors
    })

    // Clear error message if validation passes
    if (error && error.includes('required fields')) {
      setError('')
    }

    return true
  }

  const handleNext = () => {
    // Validate current step before proceeding
    if (!validateCurrentStep()) {
      return
    }

    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSubmit = async (isDraft = false) => {
    // Prevent duplicate submissions
    if (isSubmitting) {
      return
    }

    // Validate all required steps before submission (unless saving as draft)
    if (!isDraft) {
      const errors: Record<string, string> = {}

      // Validate Step 1: Basic Information
      if (!formData.name.trim()) {
        errors.name = 'Project Name is required'
      }

      // Validate Step 2: Timeline
      if (!formData.startDate) {
        errors.startDate = 'Start Date is required'
      }
      if (formData.startDate && formData.endDate) {
        const startDate = new Date(formData.startDate)
        const endDate = new Date(formData.endDate)

        // Reset time to compare dates only
        startDate.setHours(0, 0, 0, 0)
        endDate.setHours(0, 0, 0, 0)

        if (endDate <= startDate) {
          errors.endDate = 'End date must be after the start date'
          if (endDate < startDate) {
            errors.startDate = 'Start date cannot be after end date'
          }
        }
      }

      if (Object.keys(errors).length > 0) {
        setValidationErrors(prev => ({ ...prev, ...errors }))
        setError('Please fix the validation errors before submitting')
        // Scroll to first error
        const firstErrorField = Object.keys(errors)[0]
        const element = document.getElementById(firstErrorField)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
        return
      }
    }

    try {
      setIsSubmitting(true)
      setLoading(true)
      setError('')

      const url = isEditMode ? `/api/projects/${editProjectId}` : '/api/projects'
      const method = isEditMode ? 'PUT' : 'POST'

      const normalizedClients = Array.isArray(formData.clients)
        ? formData.clients.filter(clientId => typeof clientId === 'string' && clientId.trim() !== '')
        : []

      // Include hourly rates in team members data
      const teamMembersWithRates = formData.teamMembers.map(member => ({
        memberId: member.memberId,
        hourlyRate: memberHourlyRates[member.memberId] ? parseFloat(memberHourlyRates[member.memberId]) : undefined
      }))

      const payload: any = {
        ...formData,
        teamMembers: teamMembersWithRates,
        isDraft
      }

      // Ensure requireApproval respects global setting
      if (globalTimeTrackingSettings?.requireApproval === false) {
        payload.settings.requireApproval = false
      }

      if (isDraft) {
        payload.status = 'draft'
      }

      if (normalizedClients.length > 0) {
        payload.clients = normalizedClients
      } else if (isEditMode) {
        payload.clients = []
      } else {
        delete payload.clients
      }

      // Ensure externalLinks structure is correct before sending
      if (!payload.externalLinks) {
        payload.externalLinks = {
          figma: [],
          documentation: []
        }
      } else {
        payload.externalLinks = {
          figma: Array.isArray(payload.externalLinks.figma) ? payload.externalLinks.figma : [],
          documentation: Array.isArray(payload.externalLinks.documentation) ? payload.externalLinks.documentation : []
        }
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (data.success) {
        if (isEditMode) {
          if (isDraft) {
            notifySuccess({ title: '', message: 'Project has been updated and saved as draft. You can continue editing later.' })
          } else {
            notifySuccess({ title: '', message: 'Project has been updated successfully. All changes have been saved.' })
          }
        } else {
          if (isDraft) {
            notifySuccess({ title: '', message: 'Project has been saved as draft. Complete the remaining details to publish it.' })
          } else {
            notifySuccess({ title: '', message: 'Project has been created successfully and is now ready to use!' })
          }
        }

        setTimeout(() => {
          router.push('/projects')
        }, 2000)
      } else {
        notifyError({ title: 'Error', message: data.error || (isEditMode ? 'Failed to update project' : 'Failed to create project') })
      }
    } catch (err) {
      notifyError({ title: 'Error', message: isEditMode ? 'Failed to update project' : 'Failed to create project' })
    } finally {
      setIsSubmitting(false)
      setLoading(false)
    }
  }

  const progress = (currentStep / steps.length) * 100

  // Validation function to check if all required fields are filled and timeline is valid
  const isFormValid = () => {
    const hasRequiredFields = formData.name.trim() !== '' && formData.startDate !== ''
    const hasTimelineError = validationErrors.endDate !== undefined
    return hasRequiredFields && !hasTimelineError
  }

  // Validate individual fields and update error state
  const validateField = (fieldName: string, value: string) => {
    const errors = { ...validationErrors }

    if (fieldName === 'name' && !value.trim()) {
      errors.name = 'Project Name is required'
    } else if (fieldName === 'name' && value.trim()) {
      delete errors.name
    }

    if (fieldName === 'startDate') {
      if (!value) {
        errors.startDate = 'Start Date is required'
      } else {
        delete errors.startDate
      }
    }

    setValidationErrors(errors)
  }

  // Handle field changes with validation
  const handleFieldChange = (fieldName: string, value: string) => {
    setFormData(prev => ({ ...prev, [fieldName]: value }))
    validateField(fieldName, value)
  }

  // Validate timeline dates whenever start or end date changes
  useEffect(() => {
    setValidationErrors(prevErrors => {
      const errors = { ...prevErrors }

      // Clear previous date errors
      if (errors.startDate && errors.startDate.includes('date')) {
        delete errors.startDate
      }
      if (errors.endDate && errors.endDate.includes('date')) {
        delete errors.endDate
      }

      if (formData.startDate && formData.endDate) {
        const startDate = new Date(formData.startDate)
        const endDate = new Date(formData.endDate)

        // Reset time to compare dates only
        startDate.setHours(0, 0, 0, 0)
        endDate.setHours(0, 0, 0, 0)

        // Check if end date is before or equal to start date
        if (endDate <= startDate) {
          errors.endDate = 'End date must be after the start date'
          // Also highlight start date if end date is invalid
          if (endDate < startDate) {
            errors.startDate = 'Start date cannot be after end date'
          }
        }
      } else if (formData.endDate && !formData.startDate) {
        // If end date is set but start date is not, clear end date error (will be validated on submit)
        if (errors.endDate && errors.endDate.includes('date')) {
          delete errors.endDate
        }
      }

      return errors
    })
  }, [formData.startDate, formData.endDate])

  // Clear general error message when all validation errors are resolved
  useEffect(() => {
    if (error && error.includes('required fields')) {
      const hasErrors = validationErrors.name || validationErrors.startDate || validationErrors.endDate
      if (!hasErrors) {
        setError('')
      }
    }
  }, [validationErrors, error])

  // Fetch current user for attachment uploads
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const response = await fetch('/api/auth/me')
        if (response.ok) {
          const data = await response.json()
          // API returns user data directly, not wrapped in { success: true, user: ... }
          if (data && (data.id || data._id || data.email)) {
            setCurrentUser({
              firstName: data.firstName || '',
              lastName: data.lastName || '',
              email: data.email || '',
              id: data.id || data._id || ''
            })
          }
        }
      } catch (error) {
        console.error('Failed to fetch current user:', error)
      }
    }
    fetchCurrentUser()
  }, [])

  // Helper function to get or fetch current user
  const getCurrentUser = async () => {
    if (currentUser) return currentUser

    try {
      const response = await fetch('/api/auth/me')
      if (!response.ok) {
        console.error('Failed to fetch user, status:', response.status)
        return null
      }

      const data = await response.json()

      // API returns user data directly: { id, firstName, lastName, email, ... }
      if (data && (data.id || data._id || data.email)) {
        const user = {
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          email: data.email || '',
          id: data.id || data._id || ''
        }
        setCurrentUser(user)
        return user
      }

      console.error('Invalid user data structure:', data)
      return null
    } catch (error) {
      console.error('Failed to fetch current user:', error)
      return null
    }
  }

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    if (!file) return

    try {
      setIsUploadingAttachment(true)

      // Try to get user, but don't block upload if it fails
      let user = currentUser
      if (!user) {
        user = await getCurrentUser()
      }

      const formDataUpload = new FormData()
      formDataUpload.append('attachment', file)

      // Use user info if available, otherwise let the API handle it
      if (user) {
        const displayName = `${user.firstName} ${user.lastName}`.trim() || user.email
        if (displayName) {
          formDataUpload.append('uploadedByName', displayName)
        }
      }

      const response = await fetch('/api/uploads/attachments', {
        method: 'POST',
        body: formDataUpload
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorData
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = { error: errorText || 'Failed to upload attachment' }
        }
        throw new Error(errorData.error || 'Failed to upload attachment')
      }

      const uploadResult = await response.json()
      if (!uploadResult?.success) {
        throw new Error(uploadResult.error || 'Failed to upload attachment')
      }

      const attachmentData = uploadResult.data
      const displayName = user
        ? `${user.firstName} ${user.lastName}`.trim() || user.email
        : attachmentData.uploadedByName || 'User'

      setFormData(prev => ({
        ...prev,
        attachments: [
          ...prev.attachments,
          {
            name: attachmentData.name,
            url: attachmentData.url,
            size: attachmentData.size,
            type: attachmentData.type,
            uploadedAt: attachmentData.uploadedAt,
            uploadedByName: attachmentData.uploadedByName || displayName,
            uploadedById: user?.id || ''
          }
        ]
      }))
      notifySuccess({ title: '', message: 'File has been uploaded successfully and added to your project attachments.' })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload attachment'
      notifyError({ title: 'Upload Failed', message: errorMessage })
      console.error('Upload error:', err)
    } finally {
      setIsUploadingAttachment(false)
    }
  }

  // Fetch available team members
  const fetchAvailableMembers = async () => {
    try {
      // Fetch all active members without pagination limit
      const response = await fetch('/api/members?status=active&limit=1000&page=1')
      const data = await response.json()

      if (data.success) {
        setAvailableMembers(data.data.members)
      }
    } catch (error) {
      console.error('Failed to fetch members:', error)
    }
  }

  // Add team member
  const addTeamMember = (member: any) => {
    const memberId = member._id || member
    const memberIdString = typeof memberId === 'string' ? memberId : memberId.toString()

    // Check if member already exists
    const alreadyExists = formData.teamMembers.some((m: any) => m.memberId === memberIdString)

    if (alreadyExists) {
      notifyError({ title: 'Error', message: 'This team member is already added to the project' })
      return
    }

    setFormData(prev => ({
      ...prev,
      teamMembers: [...prev.teamMembers, { memberId: memberIdString }]
    }))
    setShowMemberSearch(false)
    setMemberSearchQuery('')
    notifySuccess({ title: '', message: 'Team member has been successfully added to the project team.' })
  }

  // Remove team member
  const removeTeamMember = (memberId: string) => {
    setFormData(prev => ({
      ...prev,
      teamMembers: prev.teamMembers.filter(m => m.memberId !== memberId)
    }))
    // Also remove hourly rate if set
    setMemberHourlyRates(prev => {
      const newRates = { ...prev }
      delete newRates[memberId]
      return newRates
    })
  }

  // Add client
  const addClient = (member: any) => {
    const memberId = member._id || member
    const memberIdString = typeof memberId === 'string' ? memberId : memberId.toString()

    // Check if this client is already a team member
    const isTeamMember = formData.teamMembers.some((m: { memberId: string; hourlyRate?: number }) => {
      const existingId = m.memberId
      return existingId === memberIdString
    })


    setFormData(prev => ({
      ...prev,
      clients: [memberIdString] // For now, only support one client
    }))
    setShowClientSearch(false)
    setClientSearchQuery('')
      notifySuccess({ title: '', message: 'Client has been successfully assigned to the project.' })
  }

  // Remove client
  const removeClient = (clientId: string) => {
    setFormData(prev => ({
      ...prev,
      clients: prev.clients.filter(c => c !== clientId)
    }))
  }

  const handleRemoveFigmaLink = (index: number) => {
    setFormData(prev => {
      const updatedFigmaLinks = prev.externalLinks.figma.filter((_, i) => i !== index)
      setFigmaLinksPage(prevPage => {
        const maxPage = Math.max(1, Math.ceil(updatedFigmaLinks.length / linkPaginationSize) || 1)
        const nextPage = Math.min(Math.max(prevPage, 1), maxPage)
        return nextPage
      })
      return {
        ...prev,
        externalLinks: {
          ...prev.externalLinks,
          figma: updatedFigmaLinks
        }
      }
    })
  }

  const handleRemoveDocumentationLink = (index: number) => {
    setFormData(prev => {
      const updatedDocumentationLinks = prev.externalLinks.documentation.filter((_, i) => i !== index)
      setDocLinksPage(prevPage => {
        const maxPage = Math.max(1, Math.ceil(updatedDocumentationLinks.length / linkPaginationSize) || 1)
        const nextPage = Math.min(Math.max(prevPage, 1), maxPage)
        return nextPage
      })
      return {
        ...prev,
        externalLinks: {
          ...prev.externalLinks,
          documentation: updatedDocumentationLinks
        }
      }
    })
  }

  // Filter members based on search and exclude already added members
  const filteredMembers = availableMembers.filter(member => {
    if (member && member.isActive === false) return false
    const searchTerm = memberSearchQuery.toLowerCase()
    const matchesSearch = (
      member.firstName.toLowerCase().includes(searchTerm) ||
      member.lastName.toLowerCase().includes(searchTerm) ||
      member.email.toLowerCase().includes(searchTerm)
    )

    // Exclude members that are already in the team
    const memberId = member._id || (member as any)._id
    const memberIdString = memberId ? (typeof memberId === 'string' ? memberId : String(memberId)) : ''
    const isAlreadyAdded = formData.teamMembers.some((m: any) => m.memberId === memberIdString)

    return matchesSearch && !isAlreadyAdded
  })

  // Filter clients based on search and exclude already selected client
  const filteredClients = availableMembers.filter(member => {
    if (member && member.isActive === false) return false
    const searchTerm = clientSearchQuery.toLowerCase()
    const matchesSearch = (
      member.firstName.toLowerCase().includes(searchTerm) ||
      member.lastName.toLowerCase().includes(searchTerm) ||
      member.email.toLowerCase().includes(searchTerm)
    )

    // Exclude already selected client
    const memberId = member._id || (member as any)._id
    const memberIdString = memberId ? (typeof memberId === 'string' ? memberId : String(memberId)) : ''
    const isAlreadySelected = formData.clients.some((c: string) => {
      const clientId = typeof c === 'string' ? c : String(c)
      return clientId === memberIdString
    })

    return matchesSearch && !isAlreadySelected
  })

  // Fetch global time tracking settings
  useEffect(() => {
    const fetchGlobalTimeTrackingSettings = async () => {
      try {
        const response = await fetch('/api/time-tracking/settings')
        if (response.ok) {
          const data = await response.json()
          
          // Handle both response structures: {settings: ...} or {success: true, settings: ...}
          const settings = data.settings || (data.success && data.data)
          
          if (settings) {
            setGlobalTimeTrackingSettings(settings)
          } else {
            console.warn('[CREATE/EDIT PROJECT] No settings found in response:', data)
          }
        } else {
          console.error('[CREATE/EDIT PROJECT] API request failed with status:', response.status)
        }
      } catch (error) {
        console.error('[CREATE/EDIT PROJECT] Failed to fetch global time tracking settings:', error)
      }
    }
    fetchGlobalTimeTrackingSettings()
  }, [])

  // Load members when component mounts
  useEffect(() => {
    fetchAvailableMembers()
  }, [])

  // Load project data when in edit mode
  useEffect(() => {
    if (isEditMode && editProjectId) {
      fetchProjectData(editProjectId)
    }
  }, [isEditMode, editProjectId])

  const fetchProjectData = async (projectId: string) => {
    try {
      setLoading(true)
      const response = await fetch(`/api/projects/${projectId}`)
      const data = await response.json()

      if (data.success && data.data) {
        const project = data.data

        // Extract team members with hourly rates from database objects
        const teamMembersWithRates = Array.isArray(project.teamMembers)
          ? project.teamMembers.map((member: any) => {
            // memberId is populated, so extract the _id string
            const memberId = typeof member.memberId === 'object' ? member.memberId._id : member.memberId
            return {
              memberId: memberId,
              hourlyRate: member.hourlyRate
            }
          })
          : []

        // Set hourly rates state from team members
        const hourlyRates: Record<string, string> = {}
        teamMembersWithRates.forEach((member: any) => {
          if (member.hourlyRate) {
            hourlyRates[member.memberId] = member.hourlyRate.toString()
          }
        })
        setMemberHourlyRates(hourlyRates)

        // Extract client ID from populated object or use plain ID
        const clientId = project.client
          ? (typeof project.client === 'object' && project.client._id ? project.client._id : project.client)
          : null

        setFormData({
          name: project.name || '',
          description: project.description || '',
          status: project.status || 'planning',
          priority: project.priority || 'medium',
          projectNumber: project.projectNumber,
          isBillableByDefault: project.isBillableByDefault !== undefined ? project.isBillableByDefault : true,
          startDate: project.startDate ? new Date(project.startDate).toISOString().split('T')[0] : '',
          endDate: project.endDate ? new Date(project.endDate).toISOString().split('T')[0] : '',
          budget: project.budget ? {
            ...project.budget,
            currency: orgCurrency // Use organization currency instead of project currency
          } : {
            total: 0,
            currency: orgCurrency,
            categories: {
              materials: 0,
              overhead: 0
            }
          },
          teamMembers: teamMembersWithRates,
          clients: clientId ? [clientId] : [],
          settings: project.settings || {
            allowTimeTracking: true,
            allowManualTimeSubmission: true,
            allowExpenseTracking: true,
            requireApproval: false,
            notifications: {
              taskUpdates: true,
              budgetAlerts: true,
              deadlineReminders: true
            }
          },
          tags: project.tags || [],
          customFields: project.customFields || {},
          attachments: project.attachments || [],
          externalLinks: project.externalLinks || {
            figma: [],
            documentation: []
          }
        })
        setBudgetTotalInput(
          typeof project.budget?.total === 'number' && !Number.isNaN(project.budget.total)
            ? project.budget.total.toString()
            : '0'
        )
        setMaterialsInput(
          typeof project.budget?.categories?.materials === 'number' && !Number.isNaN(project.budget.categories.materials)
            ? project.budget.categories.materials.toString()
            : '0'
        )
        setOverheadInput(
          typeof project.budget?.categories?.overhead === 'number' && !Number.isNaN(project.budget.categories.overhead)
            ? project.budget.categories.overhead.toString()
            : '0'
        )
      } else {
        notifyError({ title: 'Error', message: 'Failed to load project data' })
      }
    } catch (err) {
      notifyError({ title: 'Error', message: 'Failed to load project data' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <TooltipProvider>
      <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="outline" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                {isEditMode ? 'Edit Project' : 'Create New Project'}
              </h1>
              <p className="text-muted-foreground">
                {isEditMode ? 'Update project details and configuration' : 'Set up a new project with detailed configuration'}
              </p>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Progress</span>
                <span className="text-sm text-muted-foreground">{currentStep} of {steps.length} steps</span>
              </div>
              <Progress value={progress} className="h-2" />
              <div className="flex items-center justify-between text-sm">
                {steps.map((step) => (
                  <div key={step.id} className="flex items-center space-x-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= step.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                      }`}>
                      {currentStep > step.id ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        step.id
                      )}
                    </div>
                    <div className="hidden sm:block">
                      <div className="font-medium text-foreground">{step.title}</div>
                      <div className="text-xs text-muted-foreground">{step.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>


        <Tabs value={currentStep.toString()} className="space-y-4" onValueChange={(value) => {
          const targetStep = parseInt(value)
          // Only allow forward navigation if validation passes
          if (targetStep > currentStep) {
            if (validateCurrentStep()) {
              setCurrentStep(targetStep)
            }
          } else {
            // Allow backward navigation without validation
            setCurrentStep(targetStep)
          }
        }}>
          <TabsList className="grid w-full grid-cols-7 mt-2">
            <TabsTrigger value="1">Basic</TabsTrigger>
            <TabsTrigger value="2">Timeline</TabsTrigger>
            <TabsTrigger value="3">Budget</TabsTrigger>
            <TabsTrigger value="4">Team</TabsTrigger>
            <TabsTrigger value="5">Attachments</TabsTrigger>
            <TabsTrigger value="6">Settings</TabsTrigger>
            <TabsTrigger value="7">Review</TabsTrigger>
          </TabsList>

          {/* Step 1: Basic Information */}
          <TabsContent value="1" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
                <CardDescription>
                  Provide the essential details about your project
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Project Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    placeholder="Enter project name"
                    required
                    className={validationErrors.name ? 'border-red-500' : ''}
                  />
                  {validationErrors.name && (
                    <p className="text-sm text-red-600">{validationErrors.name}</p>
                  )}
                </div>

                {/* <div className="space-y-2">
                <Label htmlFor="projectNumber">Project Number</Label>
                <Input
                  id="projectNumber"
                  type="number"
                  value={typeof formData.projectNumber === 'number' ? formData.projectNumber : ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, projectNumber: e.target.value === '' ? undefined : parseInt(e.target.value, 10) || 0 }))}                
                  placeholder="e.g. 3"
                  min={0}
                />
              </div> */}

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe your project..."
                    rows={4}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select value={formData.status} onValueChange={(value: any) => setFormData(prev => ({ ...prev, status: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="planning">Planning</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        {isEditMode && (
                          <>
                            <SelectItem value="on_hold">On Hold</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select value={formData.priority} onValueChange={(value: any) => setFormData(prev => ({ ...prev, priority: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Step 2: Timeline */}
          <TabsContent value="2" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Project Timeline</CardTitle>
                <CardDescription>
                  Set the start and end dates for your project
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startDate" className="flex items-center gap-1">
                      Start Date <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => handleFieldChange('startDate', e.target.value)}
                      max={formData.endDate || undefined}
                      required
                      className={validationErrors.startDate ? 'border-destructive' : ''}
                    />
                    {validationErrors.startDate && (
                      <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                        <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                        {validationErrors.startDate}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="endDate">End Date</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={formData.endDate}
                      min={
                        formData.startDate
                          ? new Date(new Date(formData.startDate).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                          : undefined
                      }
                      onChange={(e) => handleFieldChange('endDate', e.target.value)}
                      disabled={!formData.startDate}
                      className={validationErrors.endDate ? 'border-destructive' : ''}
                    />
                    {!formData.startDate && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Info className="h-3 w-3" />
                        Please select start date first
                      </p>
                    )}
                    {validationErrors.endDate && (
                      <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                        <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                        {validationErrors.endDate}
                      </p>
                    )}
                  </div>
                </div>

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-sm leading-relaxed">
                    <div className="space-y-1">
                      <p>The project timeline helps with resource planning and deadline tracking.</p>
                      {formData.startDate && formData.endDate && !validationErrors.endDate && (
                        <p className="text-xs text-muted-foreground mt-2">
                          <span className="font-medium">Project Duration:</span> {formatDate(formData.startDate)} to {formatDate(formData.endDate)}
                        </p>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Step 3: Budget */}
          <TabsContent value="3" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Budget Configuration</CardTitle>
                <CardDescription>
                  Set up your project budget and cost categories
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="totalBudget">Total Budget</Label>
                    <div className="flex rounded-md shadow-sm">
                      <span className="flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm font-medium">
                        {(() => {
                          if (!organization?.currency) return 'USD'
                          return organization.currency
                        })()}
                      </span>
                    <Input
                      id="totalBudget"
                      type="number"
                      value={budgetTotalInput}
                      onChange={(e) => {
                        const value = e.target.value
                        const parsedValue = parseFloat(value)
                        setBudgetTotalInput(value)
                        setFormData(prev => ({
                          ...prev,
                          budget: {
                            ...prev.budget,
                            total: value === '' || Number.isNaN(parsedValue) ? 0 : parsedValue
                          }
                        }))
                      }}
                      placeholder="0.00"
                        className="rounded-l-none pl-3"
                    />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="defaultHourlyRate">Default Hourly Rate</Label>
                    <div className="flex rounded-md shadow-sm">
                      <span className="flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm font-medium">
                        {(() => {
                          if (!organization?.currency) return 'USD'
                          return organization.currency
                        })()}
                      </span>
                      <Input
                        id="defaultHourlyRate"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.budget.defaultHourlyRate || ''}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          budget: {
                            ...prev.budget,
                            defaultHourlyRate: parseFloat(e.target.value) || 0
                          }
                        }))}
                        className="rounded-l-none pl-3"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Default rate for team members without a specific rate
                    </p>
                  </div>
                </div>



                <div className="space-y-4">
                  <h4 className="font-medium">Budget Categories</h4>
                  <div className="grid grid-cols-3 gap-4">
                    {/* <div className="space-y-2">
                    <Label htmlFor="labor">Labor</Label>
                    <Input
                      id="labor"
                      type="number"
                      value={formData.budget.categories.labor}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        budget: { 
                          ...prev.budget, 
                          categories: { ...prev.budget.categories, labor: parseFloat(e.target.value) || 0 }
                        }
                      }))}
                      placeholder="0.00"
                    />
                  </div> */}

<div className="space-y-2">
  <Label htmlFor="materials">Materials</Label>
  <div className="flex rounded-md shadow-sm">
    <span className="flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm font-medium">
      {(() => {
        if (!organization?.currency) return 'USD'
        return organization.currency
      })()}
    </span>
  <Input
    id="materials"
    type="number"
    value={materialsInput}
    onChange={(e) => {
      const value = e.target.value
      const parsedValue = parseFloat(value)

      setMaterialsInput(value)

      setFormData(prev => ({
        ...prev,
        budget: {
          ...prev.budget,
          categories: {
            ...prev.budget.categories,
            materials:
              value === '' || Number.isNaN(parsedValue)
                ? 0
                : parsedValue
          }
        }
      }))
    }}
    placeholder="0.00"
    className="rounded-l-none pl-3"
  />
</div>
</div>


<div className="space-y-2">
  <Label htmlFor="overhead">Overhead</Label>
  <div className="flex rounded-md shadow-sm">
    <span className="flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm font-medium">
      {(() => {
        if (!organization?.currency) return 'USD'
        return organization.currency
      })()}
    </span>
  <Input
    id="overhead"
    type="number"
    value={overheadInput}
    onChange={(e) => {
      const value = e.target.value
      const parsedValue = parseFloat(value)

      setOverheadInput(value)

      setFormData(prev => ({
        ...prev,
        budget: {
          ...prev.budget,
          categories: {
            ...prev.budget.categories,
            overhead:
              value === '' || Number.isNaN(parsedValue)
                ? 0
                : parsedValue
          }
        }
      }))
    }}
    placeholder="0.00"
    className="rounded-l-none pl-3"
  />
</div>
</div>

                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Step 4: Team */}
          <TabsContent value="4" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Team Assignment</CardTitle>
                <CardDescription>
                  Assign team members and clients to your project
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Team Members Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-medium">Team Members</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowMemberSearch(!showMemberSearch)}
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Members
                    </Button>
                  </div>

                  {/* Selected Team Members */}
                  <div className="space-y-2">
                    {formData.teamMembers.length > 0 ? (
                      <div className="grid gap-2">
                        {formData.teamMembers.map((member) => {
                          const memberData = availableMembers.find(m => m._id === member.memberId)
                          if (!memberData) return null
                          return (
                            <div key={member.memberId} className="p-3 border rounded-lg bg-muted/50 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">
                                    {memberData.firstName[0]}{memberData.lastName[0]}
                                  </div>
                                  <div>
                                    <p className="font-medium text-foreground">
                                      {memberData.firstName} {memberData.lastName}
                                    </p>
                                    <p className="text-sm text-muted-foreground">{memberData.email}</p>
                                  </div>
                                  <Badge variant="outline" className="text-xs">
                                    {formatToTitleCase(memberData.role?.replace(/_/g, ' '))}
                                  </Badge>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeTeamMember(member.memberId)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                              {/* Hourly Rate Input */}
                              <div className="flex items-center gap-2">
                                <Label className="text-sm font-medium">Hourly Rate:</Label>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm text-muted-foreground">{orgCurrency}</span>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={memberHourlyRates[member.memberId] || ''}
                                    onChange={(e) => setMemberHourlyRates(prev => ({
                                      ...prev,
                                      [member.memberId]: e.target.value
                                    }))}
                                    placeholder={memberData.projectHourlyRate ? `${memberData.projectHourlyRate}` : 'Set rate'}
                                    className="w-24 h-8 text-xs"
                                  />
                                  <span className="text-xs text-muted-foreground">/hr</span>
                                  {memberData.projectHourlyRate && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setMemberHourlyRates(prev => ({
                                        ...prev,
                                        [member.memberId]: memberData.projectHourlyRate.toString()
                                      }))}
                                      className="text-xs h-6 px-2"
                                      title="Use project default rate"
                                    >
                                      Use default
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center">
                        <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">No team members assigned yet</p>
                      </div>
                    )}
                  </div>

                  {/* Member Search */}
                  {showMemberSearch && (
                    <div className="space-y-3">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Search team members..."
                          value={memberSearchQuery}
                          onChange={(e) => setMemberSearchQuery(e.target.value)}
                          className="pl-10"
                        />
                      </div>

                      <div className="max-h-48 overflow-y-auto border rounded-lg">
                        {filteredMembers.length > 0 ? (
                          <div className="space-y-1 p-2">
                            {filteredMembers.map((member) => (
                              <div
                                key={member._id}
                                className="flex items-center justify-between p-2 hover:bg-muted rounded cursor-pointer transition-colors"
                                onClick={() => addTeamMember(member)}
                              >
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">
                                    {member.firstName[0]}{member.lastName[0]}
                                  </div>
                                  <div>
                                    <p className="font-medium text-foreground">
                                      {member.firstName} {member.lastName}
                                    </p>
                                    <p className="text-sm text-muted-foreground">{member.email}</p>
                                  </div>
                                  <Badge variant="outline" className="text-xs">
                                    {formatToTitleCase(member.role?.replace(/_/g, ' '))}
                                  </Badge>
                                </div>
                                <Plus className="h-4 w-4 text-muted-foreground" />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-4 text-center text-muted-foreground">
                            <p className="text-sm">
                              {memberSearchQuery ? 'No matching members found' : 'All available members are already added'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Client Section */}
                <div className="space-y-4 mt-4">
                  <div className="flex items-center justify-between mt-6">
                    <Label className="text-base font-medium">Client</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowClientSearch(!showClientSearch)}
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Client
                    </Button>
                  </div>

                  {/* Selected Client */}
                  <div className="space-y-2">
                    {formData.clients.length > 0 ? (
                      <div className="grid gap-2">
                        {formData.clients.map((clientId) => {
                          const client = availableMembers.find(c => c._id === clientId)
                          if (!client) return null
                          return (
                            <div key={clientId} className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">
                                  {client.firstName[0]}{client.lastName[0]}
                                </div>
                                <div>
                                  <p className="font-medium text-foreground">
                                    {client.firstName} {client.lastName}
                                  </p>
                                  <p className="text-sm text-muted-foreground">{client.email}</p>
                                </div>
                                <Badge variant="outline" className="text-xs">
                                  {formatToTitleCase(client.role?.replace(/_/g, ' '))}
                                </Badge>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeClient(clientId)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center">
                        <User className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">No client assigned yet</p>
                      </div>
                    )}
                  </div>

                  {/* Client Search */}
                  {showClientSearch && (
                    <div className="space-y-3">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Search for client..."
                          value={clientSearchQuery}
                          onChange={(e) => setClientSearchQuery(e.target.value)}
                          className="pl-10"
                        />
                      </div>

                      <div className="max-h-48 overflow-y-auto border rounded-lg">
                        {filteredClients.length > 0 ? (
                          <div className="space-y-1 p-2">
                            {filteredClients.map((member) => (
                              <div
                                key={member._id}
                                className="flex items-center justify-between p-2 hover:bg-muted rounded cursor-pointer transition-colors"
                                onClick={() => addClient(member)}
                              >
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">
                                    {member.firstName[0]}{member.lastName[0]}
                                  </div>
                                  <div>
                                    <p className="font-medium text-foreground">
                                      {member.firstName} {member.lastName}
                                    </p>
                                    <p className="text-sm text-muted-foreground">{member.email}</p>
                                  </div>
                                  <Badge variant="outline" className="text-xs">
                                    {formatToTitleCase(member.role?.replace(/_/g, ' '))}
                                  </Badge>
                                </div>
                                <Plus className="h-4 w-4 text-muted-foreground" />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-4 text-center text-muted-foreground">
                            <p className="text-sm">
                              {clientSearchQuery ? 'No matching members found' : 'Client already assigned'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Summary */}
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Team Members:</span>
                    <span className="font-medium">{formData.teamMembers.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Client:</span>
                    <span className="font-medium">{formData.clients.length > 0 ? 'Assigned' : 'Not assigned'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Step 5: Attachments */}
          <TabsContent value="5" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Paperclip className="h-5 w-5" />
                  Attachments & External Links
                </CardTitle>
                <CardDescription>
                  Upload project files and add external links (Figma, documentation, etc.)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* File Attachments Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-medium">File Attachments</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => attachmentInputRef.current?.click()}
                      disabled={isUploadingAttachment}
                    >
                      {isUploadingAttachment ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Files
                        </>
                      )}
                    </Button>
                    <input
                      ref={attachmentInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.jpg,.jpeg,.png,.gif,.svg,.webp,.zip,.rar,.7z"
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || [])
                        if (files.length === 0) return
                        e.target.value = ''

                        // Improved file validation with better extension extraction
                        const validFiles = []
                        const invalidFiles = []
                        const oversizedFiles = []

                        for (const file of files) {
                          // Better extension extraction - handle files with multiple dots
                          const fileName = file.name.toLowerCase()
                          const lastDotIndex = fileName.lastIndexOf('.')
                          const extension = lastDotIndex !== -1 ? fileName.substring(lastDotIndex + 1) : ''

                          const validExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'md', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'zip', 'rar', '7z']
                          const maxFileSize = 25 * 1024 * 1024 // 25MB in bytes

                          if (!extension || !validExtensions.includes(extension)) {
                            invalidFiles.push(file.name)
                          } else if (file.size > maxFileSize) {
                            oversizedFiles.push(`${file.name} (${(file.size / (1024 * 1024)).toFixed(2)}MB)`)
                          } else {
                            validFiles.push(file)
                          }
                        }

                        // Handle different error scenarios with meaningful messages
                        if (invalidFiles.length > 0 && oversizedFiles.length > 0) {
                          notifyError({
                            title: 'Upload Failed',
                            message: `Invalid file types: ${invalidFiles.slice(0, 3).join(', ')}${invalidFiles.length > 3 ? '...' : ''}. Oversized files: ${oversizedFiles.slice(0, 3).join(', ')}${oversizedFiles.length > 3 ? '...' : ''}.`,
                            duration: 7000 // Longer duration for complex messages
                          })
                          return
                        } else if (invalidFiles.length > 0) {
                          notifyError({
                            title: 'Unsupported File Type',
                            message: `These files are not supported: ${invalidFiles.slice(0, 5).join(', ')}${invalidFiles.length > 5 ? ` and ${invalidFiles.length - 5} more` : ''}. Supported formats: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, CSV, MD, JPG, JPEG, PNG, GIF, SVG, WEBP, ZIP, RAR, 7Z.`,
                            duration: 8000 // Longer duration for detailed error messages
                          })
                          return
                        } else if (oversizedFiles.length > 0) {
                          notifyError({
                            title: 'File Too Large',
                            message: `These files exceed the 25MB limit: ${oversizedFiles.slice(0, 3).join(', ')}${oversizedFiles.length > 3 ? '...' : ''}. Please reduce file size or contact support.`,
                            duration: 6000
                          })
                          return
                        }

                        if (validFiles.length === 0) {
                          return // All files were invalid, errors already shown above
                        }

                        // Show bulk upload notification
                        if (validFiles.length > 1) {
                          notifySuccess({ title: 'Bulk Upload Started', message: `Uploading ${validFiles.length} files...` })
                        }

                        // Upload files one by one
                        for (const file of validFiles) {
                          await handleFileUpload(file)
                        }
                      }}
                    />
                  </div>

                  {/* Drag and Drop Zone */}
                  <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isDragging
                      ? 'border-primary bg-primary/5'
                      : 'border-muted hover:border-primary/50'
                      }`}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setIsDragging(true)
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setIsDragging(false)
                    }}
                    onDrop={async (e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setIsDragging(false)

                      const files = Array.from(e.dataTransfer.files)
                      // Improved file validation with better extension extraction
                      const validFiles = []
                      const invalidFiles = []
                      const oversizedFiles = []

                      for (const file of files) {
                        // Better extension extraction - handle files with multiple dots
                        const fileName = file.name.toLowerCase()
                        const lastDotIndex = fileName.lastIndexOf('.')
                        const extension = lastDotIndex !== -1 ? fileName.substring(lastDotIndex + 1) : ''

                        const validExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'md', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'zip', 'rar', '7z']
                        const maxFileSize = 25 * 1024 * 1024 // 25MB in bytes

                        if (!extension || !validExtensions.includes(extension)) {
                          invalidFiles.push(file.name)
                        } else if (file.size > maxFileSize) {
                          oversizedFiles.push(`${file.name} (${(file.size / (1024 * 1024)).toFixed(2)}MB)`)
                        } else {
                          validFiles.push(file)
                        }
                      }

                      // Handle different error scenarios with meaningful messages
                      if (invalidFiles.length > 0 && oversizedFiles.length > 0) {
                        notifyError({
                          title: 'Upload Failed',
                          message: `Invalid file types: ${invalidFiles.slice(0, 3).join(', ')}${invalidFiles.length > 3 ? '...' : ''}. Oversized files: ${oversizedFiles.slice(0, 3).join(', ')}${oversizedFiles.length > 3 ? '...' : ''}.`,
                          duration: 7000
                        })
                        return
                      } else if (invalidFiles.length > 0) {
                        notifyError({
                          title: 'Unsupported File Type',
                          message: `These files are not supported: ${invalidFiles.slice(0, 5).join(', ')}${invalidFiles.length > 5 ? ` and ${invalidFiles.length - 5} more` : ''}. Supported formats: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, CSV, MD, JPG, JPEG, PNG, GIF, SVG, WEBP, ZIP, RAR, 7Z.`,
                          duration: 8000
                        })
                        return
                      } else if (oversizedFiles.length > 0) {
                        notifyError({
                          title: 'File Too Large',
                          message: `These files exceed the 25MB limit: ${oversizedFiles.slice(0, 3).join(', ')}${oversizedFiles.length > 3 ? '...' : ''}. Please reduce file size or contact support.`,
                          duration: 6000
                        })
                        return
                      }

                      if (validFiles.length === 0) {
                        return // All files were invalid, errors already shown above
                      }

                      // Upload files one by one
                      for (const file of validFiles) {
                        await handleFileUpload(file)
                      }
                    }}
                  >
                    <Upload className={`h-12 w-12 mx-auto mb-4 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                    <p className="text-sm font-medium mb-2">
                      {isDragging ? 'Drop files here' : 'Drag and drop multiple files here'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      or click the Upload Files button above
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Supports: PDF, Word, Excel, PowerPoint, Text, CSV, Markdown, Images, ZIP, RAR, 7Z (Max 25MB each)
                    </p>
                  </div>


                  {/* Enhanced File Types Info */}
                  <div className="border rounded-lg p-4 bg-muted/20">
                    <div className="flex items-start gap-2 mb-3">
                      <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <div className="space-y-2">
                        <p className="font-medium text-sm">Supported File Types & Limits</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          <div>
                            <p className="font-medium text-muted-foreground mb-1">📄 Documents & Text:</p>
                            <p className="text-muted-foreground">PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, CSV, MD</p>
                          </div>
                          <div>
                            <p className="font-medium text-muted-foreground mb-1">🖼️ Images:</p>
                            <p className="text-muted-foreground">JPG, JPEG, PNG, GIF, SVG, WEBP</p>
                          </div>
                          <div>
                            <p className="font-medium text-muted-foreground mb-1">📦 Archives:</p>
                            <p className="text-muted-foreground">ZIP, RAR, 7Z</p>
                          </div>
                          <div>
                            <p className="font-medium text-muted-foreground mb-1">📏 Size Limit:</p>
                            <p className="text-muted-foreground">Maximum 25MB per file</p>
                          </div>
                        </div>
                        <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded text-xs">
                          <p className="text-amber-800 dark:text-amber-200">
                            <strong>Note:</strong> Files are uploaded one by one. Large uploads may take time to complete.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Attachments List */}
                  {formData.attachments.length > 0 ? (
                    <div className="space-y-4">
                      {/* Pagination Info */}
                      {formData.attachments.length > attachmentsPerPage && (
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>
                            Showing {((attachmentsPage - 1) * attachmentsPerPage) + 1} to {Math.min(attachmentsPage * attachmentsPerPage, formData.attachments.length)} of {formData.attachments.length} attachments
                          </span>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.preventDefault();
                                setAttachmentsPage(prev => Math.max(1, prev - 1));
                              }}
                              disabled={attachmentsPage === 1}
                            >
                              <ArrowLeft className="h-4 w-4" />
                              Previous
                            </Button>
                            <span className="px-3 py-1 bg-muted rounded text-xs">
                              {attachmentsPage} of {Math.ceil(formData.attachments.length / attachmentsPerPage)}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.preventDefault();
                                setAttachmentsPage(prev => Math.min(Math.ceil(formData.attachments.length / attachmentsPerPage), prev + 1));
                              }}
                              disabled={attachmentsPage === Math.ceil(formData.attachments.length / attachmentsPerPage)}
                            >
                              Next
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Attachments Grid */}
                      <div className="space-y-2">
                        {formData.attachments
                          .slice((attachmentsPage - 1) * attachmentsPerPage, attachmentsPage * attachmentsPerPage)
                          .map((attachment, index) => {
                            const actualIndex = (attachmentsPage - 1) * attachmentsPerPage + index;
                            return (
                              <div key={actualIndex} className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                                <div className="flex items-center space-x-3 flex-1 min-w-0">
                                  {attachment.type.startsWith('image/') ? (
                                    <Image className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                                  ) : (
                                    <File className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm truncate">{attachment.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {(attachment.size / 1024).toFixed(2)} KB • {attachment.uploadedByName}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => window.open(attachment.url, '_blank')}
                                      >
                                        <ExternalLink className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Open file</p>
                                    </TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          setFormData(prev => {
                                            const newAttachments = prev.attachments.filter((_, i) => i !== actualIndex);
                                            // Reset pagination if needed
                                            const maxPage = Math.ceil(newAttachments.length / attachmentsPerPage);
                                            if (attachmentsPage > maxPage && maxPage > 0) {
                                              setAttachmentsPage(maxPage);
                                            } else if (newAttachments.length === 0) {
                                              setAttachmentsPage(1);
                                            }
                                            return {
                                              ...prev,
                                              attachments: newAttachments
                                            };
                                          })
                                        }}
                                      >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Delete file</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                              </div>
                            );
                          })}
                      </div>

                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center">
                      <Paperclip className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">No attachments uploaded yet</p>
                    </div>
                  )}
                </div>

                {/* External Links Section */}
                <div className="space-y-4 pt-4 border-t">
                  <Label className="text-base font-medium">External Links</Label>

                  {/* Figma Links */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <LinkIcon className="h-4 w-4" />
                      Figma Links
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="https://www.figma.com/file/..."
                        value={newFigmaLink}
                        onChange={(e) => setNewFigmaLink(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newFigmaLink.trim()) {
                            e.preventDefault()
                            const link = newFigmaLink.trim()
                            // Ensure URL has protocol to prevent relative URL navigation
                            const formattedLink = link.startsWith('http://') || link.startsWith('https://')
                              ? link
                              : `https://${link}`
                            setFormData(prev => ({
                              ...prev,
                              externalLinks: {
                                ...prev.externalLinks,
                                figma: [...prev.externalLinks.figma, formattedLink]
                              }
                            }))
                            setNewFigmaLink('')
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (newFigmaLink.trim()) {
                            const link = newFigmaLink.trim()
                            // Ensure URL has protocol to prevent relative URL navigation
                            const formattedLink = link.startsWith('http://') || link.startsWith('https://')
                              ? link
                              : `https://${link}`
                            setFormData(prev => ({
                              ...prev,
                              externalLinks: {
                                ...prev.externalLinks,
                                figma: [...prev.externalLinks.figma, formattedLink]
                              }
                            }))
                            setNewFigmaLink('')
                          }
                        }}
                        disabled={!newFigmaLink.trim()}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {figmaLinks.length > 0 && (
                      <div className="space-y-3">
                        {figmaLinks.length > linkPaginationSize && (
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              Showing {figmaShowingStart} to {figmaShowingEnd} of {figmaLinks.length} Figma links
                            </span>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setFigmaLinksPage(prev => Math.max(1, prev - 1))}
                                disabled={currentFigmaPage === 1}
                              >
                                <ArrowLeft className="h-4 w-4" />
                                Previous
                              </Button>
                              <span className="px-2.5 py-1 bg-muted rounded text-[11px]">
                                {currentFigmaPage} of {figmaTotalPages}
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setFigmaLinksPage(prev => Math.min(prev + 1, figmaTotalPages))}
                                disabled={currentFigmaPage === figmaTotalPages}
                              >
                                Next
                                <ArrowRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                        <div className="space-y-1">
                          {paginatedFigmaLinks.map((link, index) => {
                            const actualIndex = figmaSliceStart + index
                            const formattedLink = link.startsWith('http://') || link.startsWith('https://')
                              ? link
                              : `https://${link}`
                            return (
                              <div key={actualIndex} className="flex items-center justify-between p-2 border rounded-lg bg-muted/50">
                                <a
                                  href={formattedLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-primary hover:underline flex-1 truncate"
                                >
                                  {link}
                                </a>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveFigmaLink(actualIndex)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Documentation Links */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <LinkIcon className="h-4 w-4" />
                      Documentation URLs
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="https://docs.example.com/..."
                        value={newDocLink}
                        onChange={(e) => setNewDocLink(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newDocLink.trim()) {
                            e.preventDefault()
                            const link = newDocLink.trim()
                            // Ensure URL has protocol to prevent relative URL navigation
                            const formattedLink = link.startsWith('http://') || link.startsWith('https://')
                              ? link
                              : `https://${link}`
                            setFormData(prev => ({
                              ...prev,
                              externalLinks: {
                                ...prev.externalLinks,
                                documentation: [...prev.externalLinks.documentation, formattedLink]
                              }
                            }))
                            setNewDocLink('')
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (newDocLink.trim()) {
                            const link = newDocLink.trim()
                            // Ensure URL has protocol to prevent relative URL navigation
                            const formattedLink = link.startsWith('http://') || link.startsWith('https://')
                              ? link
                              : `https://${link}`
                            setFormData(prev => ({
                              ...prev,
                              externalLinks: {
                                ...prev.externalLinks,
                                documentation: [...prev.externalLinks.documentation, formattedLink]
                              }
                            }))
                            setNewDocLink('')
                          }
                        }}
                        disabled={!newDocLink.trim()}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {documentationLinks.length > 0 && (
                      <div className="space-y-3">
                        {documentationLinks.length > linkPaginationSize && (
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              Showing {documentationShowingStart} to {documentationShowingEnd} of {documentationLinks.length} documentation links
                            </span>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setDocLinksPage(prev => Math.max(1, prev - 1))}
                                disabled={currentDocumentationPage === 1}
                              >
                                <ArrowLeft className="h-4 w-4" />
                                Previous
                              </Button>
                              <span className="px-2.5 py-1 bg-muted rounded text-[11px]">
                                {currentDocumentationPage} of {documentationTotalPages}
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setDocLinksPage(prev => Math.min(prev + 1, documentationTotalPages))}
                                disabled={currentDocumentationPage === documentationTotalPages}
                              >
                                Next
                                <ArrowRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                        <div className="space-y-1">
                          {paginatedDocumentationLinks.map((link, index) => {
                            const actualIndex = docSliceStart + index
                            const formattedLink = link.startsWith('http://') || link.startsWith('https://')
                              ? link
                              : `https://${link}`
                            return (
                              <div key={actualIndex} className="flex items-center justify-between p-2 border rounded-lg bg-muted/50">
                                <a
                                  href={formattedLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-primary hover:underline flex-1 truncate"
                                >
                                  {link}
                                </a>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveDocumentationLink(actualIndex)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Step 6: Settings */}
          <TabsContent value="6" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Project Settings</CardTitle>
                <CardDescription>
                  Configure project-specific settings and preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Billable Project</Label>
                      <p className="text-sm text-muted-foreground">New tasks will default to billable; you can override per task.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.isBillableByDefault}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        isBillableByDefault: e.target.checked
                      }))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Allow Time Tracking</Label>
                      <p className="text-sm text-muted-foreground">Enable time tracking for this project</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.settings.allowTimeTracking}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        settings: { ...prev.settings, allowTimeTracking: e.target.checked }
                      }))}
                    />
                  </div>

                  {formData.settings.allowTimeTracking && (
                    <div className="ml-6 pl-4 border-l-2 border-muted">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Allow Manual Time Submission</Label>
                          <p className="text-sm text-muted-foreground">Allow team members to submit time entries manually after completing tasks</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={formData.settings.allowManualTimeSubmission}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            settings: { ...prev.settings, allowManualTimeSubmission: e.target.checked }
                          }))}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Allow Expense Tracking</Label>
                      <p className="text-sm text-muted-foreground">Enable expense tracking for this project</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.settings.allowExpenseTracking}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        settings: { ...prev.settings, allowExpenseTracking: e.target.checked }
                      }))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <Label>Require Approval</Label>
                      <p className="text-sm text-muted-foreground">
                        Require approval for time entries and expenses
                        {globalTimeTrackingSettings?.requireApproval === false && (
                          <span className="block text-xs text-amber-600 dark:text-amber-400 mt-1">
                            ⚠️ Disabled globally in Application Settings
                          </span>
                        )}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={(() => {
                        const isChecked = globalTimeTrackingSettings?.requireApproval === false ? false : formData.settings.requireApproval
                        return isChecked
                      })()}
                      disabled={globalTimeTrackingSettings?.requireApproval === false}
                      onChange={(e) => {
                        setFormData(prev => ({
                          ...prev,
                          settings: { ...prev.settings, requireApproval: e.target.checked }
                        }))
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Step 7: Review */}
          <TabsContent value="7" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Project Overview */}
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span>Project Overview</span>
                    </CardTitle>
                    <CardDescription>
                      Review all project details before creating
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Basic Information */}
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <h4 className="font-semibold text-foreground">Basic Information</h4>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium text-muted-foreground">Project Name</span>
                            <span className="text-sm text-foreground font-medium break-words whitespace-normal">{formData.name || 'Not set'}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">Project Number</span>
                            <span className="text-sm text-foreground font-medium">{typeof formData.projectNumber === 'number' ? `#${formData.projectNumber}` : 'Not set'}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">Status</span>
                            <Badge className={getStatusBadgeStyles(formData.status)}>
                              {formatToTitleCase(formData.status.replace(/_/g, ' '))}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">Priority</span>
                            <Badge className={formData.priority === 'high' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}>
                              {formData.priority}
                            </Badge>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <span className="text-sm font-medium text-muted-foreground">Description</span>
                            <p className="text-sm text-foreground mt-1">{formData.description || 'No description provided'}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Timeline */}
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <h4 className="font-semibold text-foreground">Timeline</h4>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">Start Date</span>
                            <span className="text-sm text-foreground">{formData.startDate ? formatDate(formData.startDate) : 'Not set'}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">End Date</span>
                            <span className="text-sm text-foreground">{formData.endDate ? formatDate(formData.endDate) : 'Not set'}</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {formData.startDate && formData.endDate && (
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-muted-foreground">Duration</span>
                              <span className="text-sm text-foreground">
                                {Math.ceil((new Date(formData.endDate).getTime() - new Date(formData.startDate).getTime()) / (1000 * 60 * 60 * 24))} days
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Budget */}
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                        <h4 className="font-semibold text-foreground">Budget</h4>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">Total Budget</span>
                            <span className="text-sm text-foreground font-semibold">{formData.budget.currency} {formData.budget.total.toLocaleString()}</span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">Materials</span>
                            <span className="text-sm text-foreground">{formData.budget.currency} {formData.budget.categories.materials.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">Overhead</span>
                            <span className="text-sm text-foreground">{formData.budget.currency} {formData.budget.categories.overhead.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="text-sm text-muted-foreground">Budget Distribution</div>
                          <div className="space-y-2">
                            {/* <div className="flex items-center justify-between text-xs">
                            <span>Labor</span>
                            <span>{formData.budget.total > 0 ? Math.round((formData.budget.categories.labor / formData.budget.total) * 100) : 0}%</span>
                          </div> */}
                            {/* <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-500 h-2 rounded-full"
                              style={{ width: `${formData.budget.total > 0 ? (formData.budget.categories.labor / formData.budget.total) * 100 : 0}%` }}
                            />
                          </div> */}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Team Assignment */}
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                        <h4 className="font-semibold text-foreground">Team Assignment</h4>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">Team Members</span>
                            <span className="text-sm text-foreground font-medium">{formData.teamMembers.length}</span>
                          </div>
                          {formData.teamMembers.length > 0 && (
                            <div className="space-y-1">
                              {formData.teamMembers.slice(0, 3).map((member) => {
                                const memberData = availableMembers.find(m => m._id === member.memberId)
                                if (!memberData) return null
                                return (
                                  <div key={member.memberId} className="flex items-center space-x-2 text-xs">
                                    <div className="w-4 h-4 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs">
                                      {memberData.firstName[0]}{memberData.lastName[0]}
                                    </div>
                                    <span className="text-foreground">{memberData.firstName} {memberData.lastName}</span>
                                    <Badge variant="outline" className="text-xs">{formatToTitleCase(memberData.role?.replace(/_/g, ' '))}</Badge>
                                    {member.hourlyRate && (
                                      <span className="text-xs text-muted-foreground">
                                        {orgCurrency} {member.hourlyRate}/hr
                                      </span>
                                    )}
                                  </div>
                                )
                              })}
                              {formData.teamMembers.length > 3 && (
                                <div className="text-xs text-muted-foreground">
                                  +{formData.teamMembers.length - 3} more members
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">Client</span>
                            <span className="text-sm text-foreground font-medium">
                              {formData.clients.length > 0 ? 'Assigned' : 'Not assigned'}
                            </span>
                          </div>
                          {formData.clients.length > 0 && (
                            <div className="space-y-1">
                              {formData.clients.map((clientId) => {
                                const client = availableMembers.find(c => c._id === clientId)
                                if (!client) return null
                                return (
                                  <div key={clientId} className="flex items-center space-x-2 text-xs">
                                    <div className="w-4 h-4 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs">
                                      {client.firstName[0]}{client.lastName[0]}
                                    </div>
                                    <span className="text-foreground">{client.firstName} {client.lastName}</span>
                                    <Badge variant="outline" className="text-xs">{formatToTitleCase(client.role?.replace(/_/g, ' '))}</Badge>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Settings */}
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                        <h4 className="font-semibold text-foreground">Settings</h4>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">Time Tracking</span>
                            <Badge className={formData.settings.allowTimeTracking ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                              {formData.settings.allowTimeTracking ? 'Enabled' : 'Disabled'}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">Expense Tracking</span>
                            <Badge className={formData.settings.allowExpenseTracking ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                              {formData.settings.allowExpenseTracking ? 'Enabled' : 'Disabled'}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">Require Approval</span>
                            <Badge className={formData.settings.requireApproval ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800'}>
                              {formData.settings.requireApproval ? 'Yes' : 'No'}
                            </Badge>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-muted-foreground">Notifications</div>
                          <div className="space-y-1 text-xs text-foreground">
                            <div className="flex items-center justify-between">
                              <span>Task Updates</span>
                              <span>{formData.settings.notifications.taskUpdates ? '✓' : '✗'}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Budget Alerts</span>
                              <span>{formData.settings.notifications.budgetAlerts ? '✓' : '✗'}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Deadline Reminders</span>
                              <span>{formData.settings.notifications.deadlineReminders ? '✓' : '✗'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Action Panel */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Ready to Create?</CardTitle>
                    <CardDescription>
                      Review your project details and choose your next step
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <Button
                        onClick={() => handleSubmit(false)}
                        disabled={isSubmitting || !isFormValid()}
                        className="w-full"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {isEditMode ? 'Updating...' : 'Creating...'}
                          </>
                        ) : (
                          <>
                            <CheckCircle className="mr-2 h-4 w-4" />
                            {isEditMode ? 'Update Project' : 'Create Project'}
                          </>
                        )}
                      </Button>

                      <Button
                        variant="outline"
                        onClick={() => handleSubmit(true)}
                        disabled={isSubmitting}
                        className="w-full"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {isEditMode ? 'Updating...' : 'Saving...'}
                          </>
                        ) : (
                          <>
                            <Save className="mr-2 h-4 w-4" />
                            {isEditMode ? 'Update Draft' : 'Save as Draft'}
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="pt-4 border-t">
                      <div className="text-sm text-muted-foreground space-y-2">
                        <div className="flex items-center space-x-2">
                          {formData.name.trim() !== '' ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-red-600" />
                          )}
                          <span>Project name {formData.name.trim() !== '' ? 'completed' : 'required'}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          {formData.startDate !== '' ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-red-600" />
                          )}
                          <span>Start date {formData.startDate !== '' ? 'completed' : 'required'}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span>Project settings configured</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span>Budget allocation set</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => setCurrentStep(6)}
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back to Settings
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => setCurrentStep(1)}
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      Edit Details
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Navigation Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 pt-6 mt-8 border-t border-muted">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 1}
            className="w-full sm:w-auto"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>

          {currentStep < steps.length && (
            <Button onClick={handleNext} className="w-full sm:w-auto">
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </MainLayout>
    </TooltipProvider>
  )
}
