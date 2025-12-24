'use client'

import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/Badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Upload, X, File, Image, Paperclip, AlertCircle, DollarSign, Calendar, Tag, CreditCard } from 'lucide-react'
import { useOrganization } from '@/hooks/useOrganization'
import { useToast } from '@/components/ui/Toast'
import { useNotify } from '@/lib/notify'
import { cn } from '@/lib/utils'

interface AddExpenseDialogProps {
  open: boolean
  onClose: () => void
  projectId: string
  onSuccess: () => void
  expense?: any // Optional expense object for editing
}

interface ExpenseFormData {
  name: string
  description: string
  unitPrice: string
  quantity: string
  fullAmount: string
  expenseDate: string
  category: 'labor' | 'materials' | 'overhead' | 'external' | 'other'
  isBillable: boolean
  paidStatus: 'paid' | 'unpaid'
  paidBy: string
  attachments: Array<{
    name: string
    url: string
    size: number
    type: string
    uploadedAt?: string
    uploadedBy?: string
  }>
}

export function AddExpenseDialog({ open, onClose, projectId, onSuccess, expense }: AddExpenseDialogProps) {
  const { organization } = useOrganization()
  const orgCurrency = organization?.currency || 'USD'
  const { showToast } = useToast()
  const { error: notifyError } = useNotify()
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null)
  const [attachmentsPage, setAttachmentsPage] = useState(1)
  const attachmentsPerPage = 6
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const [initialFormData, setInitialFormData] = useState<ExpenseFormData | null>(null)

  const [formData, setFormData] = useState<ExpenseFormData>({
    name: '',
    description: '',
    unitPrice: '',
    quantity: '1',
    fullAmount: '',
    expenseDate: new Date().toISOString().split('T')[0],
    category: 'other',
    isBillable: false,
    paidStatus: 'unpaid',
    paidBy: '',
    attachments: []
  })

  // Initialize form data when expense prop changes or dialog opens
  useEffect(() => {
    if (open && expense) {
      const expenseFormData = {
        name: expense.name || '',
        description: expense.description || '',
        unitPrice: expense.unitPrice?.toString() || '',
        quantity: expense.quantity?.toString() || '1',
        fullAmount: expense.fullAmount?.toString() || '',
        expenseDate: expense.expenseDate ? new Date(expense.expenseDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        category: (expense.category as ExpenseFormData['category']) || 'other',
        isBillable: expense.isBillable || false,
        paidStatus: (expense.paidStatus as ExpenseFormData['paidStatus']) || 'unpaid',
        paidBy: expense.paidBy || '',
        attachments: expense.attachments || []
      }
      setFormData(expenseFormData)
      setInitialFormData(expenseFormData)
    } else if (open && !expense) {
      // Reset for add mode
      const defaultFormData: ExpenseFormData = {
        name: '',
        description: '',
        unitPrice: '',
        quantity: '1',
        fullAmount: '',
        expenseDate: new Date().toISOString().split('T')[0],
        category: 'other',
        isBillable: false,
        paidStatus: 'unpaid',
        paidBy: '',
        attachments: []
      }
      setFormData(defaultFormData)
      setInitialFormData(null)
    }
  }, [open, expense])

  // Form validation check
  const isFormValid =
    formData.name.trim() !== '' &&
    formData.category &&
    formData.unitPrice !== '' &&
    formData.quantity !== '' &&
    formData.expenseDate !== '' &&
    formData.paidStatus &&
    (formData.paidStatus !== 'paid' || formData.paidBy.trim() !== '');

  // Check if any changes have been made (only for edit mode)
  const hasChanges = initialFormData ? (() => {
    return (
      formData.name !== initialFormData.name ||
      formData.description !== initialFormData.description ||
      formData.unitPrice !== initialFormData.unitPrice ||
      formData.quantity !== initialFormData.quantity ||
      formData.fullAmount !== initialFormData.fullAmount ||
      formData.expenseDate !== initialFormData.expenseDate ||
      formData.category !== initialFormData.category ||
      formData.isBillable !== initialFormData.isBillable ||
      formData.paidStatus !== initialFormData.paidStatus ||
      formData.paidBy !== initialFormData.paidBy ||
      JSON.stringify(formData.attachments) !== JSON.stringify(initialFormData.attachments)
    )
  })() : true; // For add mode, always allow submission if form is valid

  useEffect(() => {
    if (open) {
      // Reset form to initial state when dialog opens
      if (expense) {
        // Editing mode - populate with existing expense data
        setFormData({
          name: expense.name || '',
          description: expense.description || '',
          unitPrice: expense.unitPrice?.toString() || '',
          quantity: expense.quantity?.toString() || '1',
          fullAmount: expense.fullAmount?.toString() || '',
          expenseDate: expense.expenseDate ? new Date(expense.expenseDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          category: expense.category || 'other',
          isBillable: expense.isBillable || false,
          paidStatus: expense.paidStatus || 'unpaid',
          paidBy: expense.paidBy || '',
          attachments: expense.attachments || []
        })
      } else {
        // Adding mode - reset to empty state
        setFormData({
          name: '',
          description: '',
          unitPrice: '',
          quantity: '1',
          fullAmount: '',
          expenseDate: new Date().toISOString().split('T')[0],
          category: 'other',
          isBillable: false,
          paidStatus: 'unpaid',
          paidBy: '',
          attachments: []
        })
      }
      setAttachmentsPage(1)
      setUploading(false)

      // Fetch current user
      const fetchCurrentUser = async () => {
        try {
          const response = await fetch('/api/auth/me')
          if (response.ok) {
            const data = await response.json()
            setCurrentUser({ id: data.id })
          }
        } catch (error) {
          console.error('Error fetching current user:', error)
        }
      }
      fetchCurrentUser()
    }
  }, [open, expense])

  useEffect(() => {
    // Calculate full amount when unit price or quantity changes
    const unitPrice = parseFloat(formData.unitPrice) || 0
    const quantity = parseFloat(formData.quantity) || 1
    const fullAmount = unitPrice * quantity
    setFormData(prev => ({ ...prev, fullAmount: fullAmount.toFixed(2) }))
  }, [formData.unitPrice, formData.quantity])

  const handleFileUpload = async (files: FileList) => {
    if (!currentUser) {
      notifyError({ title: 'Upload Failed', message: 'User information is still loading. Please try again shortly.' })
      return
    }

    const fileArray = Array.from(files)
    const maxSize = 25 * 1024 * 1024 // 25MB (matching server limit)
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv', 'text/markdown'
    ]

    for (const file of fileArray) {
      if (file.size > maxSize) {
        notifyError({
          title: 'File Too Large',
          message: `File ${file.name} is too large. Maximum size is 25MB.`
        })
        return
      }
      if (!allowedTypes.includes(file.type)) {
        notifyError({
          title: 'Unsupported File Type',
          message: `File type ${file.type} is not allowed for ${file.name}. Please use PDF, Images, Excel, Word, or text files.`
        })
        return
      }
    }

    try {
      setUploading(true)

      // Show uploading notification
      showToast({
        title: 'Uploading Files',
        message: `Uploading ${fileArray.length} file${fileArray.length > 1 ? 's' : ''}...`,
        type: 'info',
        duration: 3000
      })

      const uploadPromises = fileArray.map(async (file) => {
        const formData = new FormData()
        formData.append('attachment', file)

        console.log('Uploading file:', file.name, 'Size:', file.size, 'Type:', file.type)

        const response = await fetch('/api/uploads/attachments', {
          method: 'POST',
          body: formData
        })

        console.log('Upload response for', file.name, ':', response.status, response.statusText)

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
          const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`
          throw new Error(`Failed to upload ${file.name}: ${errorMessage}`)
        }

        const data = await response.json()
        console.log('Upload successful for', file.name, ':', data)

        // API returns data in nested structure: { success: true, data: { url: ... } }
        const fileData = data.data || data
        if (!fileData.url) {
          throw new Error(`Invalid response for ${file.name}: missing URL`)
        }

        return {
          name: file.name,
          url: fileData.url,
          size: file.size,
          type: file.type
        }
      })

      const uploadedFiles = await Promise.all(uploadPromises)

      setFormData(prev => ({
        ...prev,
        attachments: [...prev.attachments, ...uploadedFiles]
      }))

      // Show success notification
      showToast({
        title: 'Upload Successful',
        message: `Successfully uploaded ${uploadedFiles.length} file${uploadedFiles.length > 1 ? 's' : ''}.`,
        type: 'success',
        duration: 3000
      })

    } catch (err: any) {
      console.error('Upload error:', err)
      notifyError({
        title: 'Upload Failed',
        message: err.message || 'Failed to upload files. Please try again.'
      })
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveAttachment = (index: number) => {
    setFormData(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isFormValid) {
      notifyError({
        title: 'Validation Error',
        message: 'Please fill in all required fields'
      })
      return
    }

    try {
      setLoading(true)

      const requestBody = {
        ...(expense && { expenseId: expense._id }), // Include expenseId for updates
        name: formData.name,
        description: formData.description,
        unitPrice: parseFloat(formData.unitPrice),
        quantity: parseFloat(formData.quantity),
        fullAmount: parseFloat(formData.fullAmount),
        expenseDate: formData.expenseDate,
        category: formData.category,
        isBillable: formData.isBillable,
        paidStatus: formData.paidStatus,
        paidBy: formData.paidStatus === 'paid' && formData.paidBy ? formData.paidBy : undefined,
        attachments: formData.attachments.map(att => ({
          ...att,
          uploadedBy: currentUser?.id,
          uploadedAt: att.uploadedAt || new Date().toISOString()
        }))
      }

      const response = await fetch(`/api/projects/${projectId}/expenses`, {
        method: expense ? 'PUT' : 'POST', // Use PUT for updates, POST for creates
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      const data = await response.json()

      if (data.success) {
        showToast({
          title: expense ? 'Expense Updated' : 'Expense Added',
          message: expense ? 'Expense has been updated successfully' : 'Expense has been added successfully',
          type: 'success'
        })

        if (!expense) {
          // Only reset form for new expenses, not updates
          setFormData({
            name: '',
            description: '',
            unitPrice: '',
            quantity: '1',
            fullAmount: '',
            expenseDate: new Date().toISOString().split('T')[0],
            category: 'other',
            isBillable: false,
            paidStatus: 'unpaid',
            paidBy: '',
            attachments: []
          })
        }
        onSuccess()
        onClose()
      } else {
        notifyError({
          title: expense ? 'Failed to Update Expense' : 'Failed to Add Expense',
          message: data.error || `Failed to ${expense ? 'update' : 'add'} expense. Please try again.`
        })
      }
    } catch (err: any) {
      notifyError({
        title: expense ? 'Failed to Update Expense' : 'Failed to Add Expense',
        message: err.message || `Failed to ${expense ? 'update' : 'add'} expense. Please try again.`
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0 bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl">
        <DialogHeader className="p-6 border-b border-border/50 bg-muted/20">
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <DollarSign className="h-5 w-5" />
            </div>
            {expense ? 'Edit Expense' : 'Add New Expense'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground ml-11">
            {expense ? 'Update expense details. Modify the information below.' : 'Record a new project expense. Fill in the details below.'}
          </DialogDescription>
        </DialogHeader>


        <form onSubmit={handleSubmit} className="p-6 space-y-8">
          {/* Basic Information Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Tag className="h-4 w-4" /> Basic Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="category" className="text-sm font-medium">Category <span className="text-destructive">*</span></Label>
                <Select
                  value={formData.category}
                  onValueChange={(value: any) => setFormData(prev => ({ ...prev, category: value }))}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="materials">Materials</SelectItem>
                    <SelectItem value="overhead">Overhead</SelectItem>
                    <SelectItem value="external">External Services</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">Expense Name <span className="text-destructive">*</span></Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Server Costs, Design Assets"
                  className="h-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Add more details about this expense..."
                rows={3}
                className="resize-none"
              />
            </div>
          </div>

          {/* Cost Details Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Cost Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label htmlFor="unitPrice" className="text-sm font-medium">Unit Price ({orgCurrency}) <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Input
                    id="unitPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.unitPrice}
                    onChange={(e) => setFormData(prev => ({ ...prev, unitPrice: e.target.value }))}
                    placeholder="0.00"
                    className="h-10 pl-8"
                    required
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="quantity" className="text-sm font-medium">Quantity <span className="text-destructive">*</span></Label>
                <Input
                  id="quantity"
                  type="number"
                  step="1"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))}
                  placeholder="1"
                  className="h-10"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullAmount" className="text-sm font-medium">Total Amount ({orgCurrency})</Label>
                <div className="relative">
                  <Input
                    id="fullAmount"
                    type="number"
                    value={formData.fullAmount}
                    readOnly
                    className="h-10 pl-8 bg-muted/50 font-medium"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment & Status Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> Payment & Status
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="expenseDate" className="text-sm font-medium">Date of Expense <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Input
                    id="expenseDate"
                    type="date"
                    value={formData.expenseDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, expenseDate: e.target.value }))}
                    className="h-10 pl-10"
                    required
                  />
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="paidStatus" className="text-sm font-medium">Payment Status <span className="text-destructive">*</span></Label>
                <Select
                  value={formData.paidStatus}
                  onValueChange={(value: 'paid' | 'unpaid') => {
                    setFormData(prev => ({ ...prev, paidStatus: value, paidBy: value === 'unpaid' ? '' : prev.paidBy }))
                  }}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-green-500" />
                        Paid
                      </div>
                    </SelectItem>
                    <SelectItem value="unpaid">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-yellow-500" />
                        Unpaid
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.paidStatus === 'paid' && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                <Label htmlFor="paidBy" className="text-sm font-medium">Paid By <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Input
                    id="paidBy"
                    value={formData.paidBy}
                    onChange={(e) => setFormData(prev => ({ ...prev, paidBy: e.target.value }))}
                    placeholder="Enter who paid for this expense or click Find"
                    className="h-10 pr-20"
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="absolute right-1 top-1 h-8 px-3 text-xs"
                    onClick={() => {
                      // TODO: Open user selection modal
                      showToast({ title: 'Find functionality coming soon', type: 'info' })
                    }}
                  >
                    Find
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Type a name or click Find to search for employees
                </p>
              </div>
            )}

            <div className="flex items-center space-x-3 p-4 rounded-lg border border-border/50 bg-muted/20">
              <Switch
                id="isBillable"
                checked={formData.isBillable}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isBillable: checked }))}
              />
              <div className="flex-1">
                <Label htmlFor="isBillable" className="cursor-pointer font-medium">
                  Billable Expense
                </Label>
                <p className="text-xs text-muted-foreground">
                  This expense will be billed to the client
                </p>
              </div>
              {formData.isBillable && (
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">Billable</Badge>
              )}
            </div>
          </div>

          {/* Attachments Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Paperclip className="h-4 w-4" /> Attachments
            </h3>
            <div
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200",
                uploading
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20 cursor-not-allowed"
                  : isDragging
                  ? "border-primary bg-primary/5 scale-[1.01] cursor-pointer"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30 cursor-pointer"
              )}
              onDragOver={(e) => {
                if (!uploading) {
                  e.preventDefault()
                  setIsDragging(true)
                }
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                if (!uploading) {
                  e.preventDefault()
                  setIsDragging(false)
                  if (e.dataTransfer.files.length > 0) {
                    handleFileUpload(e.dataTransfer.files)
                  }
                }
              }}
              onClick={() => !uploading && fileInputRef.current?.click()}
            >
              <div className="flex flex-col items-center gap-3">
                <div className="p-3 rounded-full bg-muted">
                  {uploading ? (
                    <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
                  ) : (
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="space-y-1">
                  {uploading ? (
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                        Uploading files...
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Please wait while we process your files
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        <span className="text-primary hover:underline">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-muted-foreground">
                        PDF, Images, Excel, Word, CSV (max 25MB each)
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                disabled={uploading}
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFileUpload(e.target.files)
                    // Reset input value to allow re-uploading same file
                    e.target.value = ''
                  }
                }}
              />
            </div>

            {formData.attachments.length > 0 && (
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">
                    Attachments ({formData.attachments.length})
                  </h4>
                  {formData.attachments.length > attachmentsPerPage && (
                    <div className="flex items-center space-x-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setAttachmentsPage(prev => Math.max(1, prev - 1))}
                        disabled={attachmentsPage === 1}
                      >
                        Previous
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Page {attachmentsPage} of {Math.ceil(formData.attachments.length / attachmentsPerPage)}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setAttachmentsPage(prev => Math.min(Math.ceil(formData.attachments.length / attachmentsPerPage), prev + 1))}
                        disabled={attachmentsPage === Math.ceil(formData.attachments.length / attachmentsPerPage)}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {formData.attachments
                    .slice((attachmentsPage - 1) * attachmentsPerPage, attachmentsPage * attachmentsPerPage)
                    .map((attachment, index) => {
                      const actualIndex = (attachmentsPage - 1) * attachmentsPerPage + index
                      return (
                        <div key={actualIndex} className="flex items-center justify-between p-3 border rounded-lg bg-background group hover:border-primary/30 transition-colors">
                          <div className="flex items-center space-x-3 overflow-hidden">
                            <div className="p-2 rounded-md bg-muted">
                              {attachment.type.startsWith('image/') ? (
                                <Image className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <File className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm font-medium truncate">{attachment.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {(attachment.size / 1024).toFixed(2)} KB
                              </span>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRemoveAttachment(actualIndex)
                            }}
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

          <div className="flex justify-end space-x-3 pt-6 border-t border-border/50">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || uploading || !isFormValid || (expense && !hasChanges)}
              className="min-w-[120px]"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {expense ? 'Updating...' : 'Adding...'}
                </>
              ) : (
                expense ? 'Update Expense' : 'Add Expense'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

