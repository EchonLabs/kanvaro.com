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
import { cn } from '@/lib/utils'

interface AddExpenseDialogProps {
  open: boolean
  onClose: () => void
  projectId: string
  onSuccess: () => void
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
  }>
}

export function AddExpenseDialog({ open, onClose, projectId, onSuccess }: AddExpenseDialogProps) {
  const { organization } = useOrganization()
  const orgCurrency = organization?.currency || 'USD'
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

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

  // Form validation check
  const isFormValid =
    formData.name.trim() !== '' &&
    formData.category &&
    formData.unitPrice !== '' &&
    formData.quantity !== '' &&
    formData.expenseDate !== '' &&
    formData.paidStatus &&
    (formData.paidStatus !== 'paid' || formData.paidBy.trim() !== '');

  useEffect(() => {
    if (open) {
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
  }, [open])

  useEffect(() => {
    // Calculate full amount when unit price or quantity changes
    const unitPrice = parseFloat(formData.unitPrice) || 0
    const quantity = parseFloat(formData.quantity) || 1
    const fullAmount = unitPrice * quantity
    setFormData(prev => ({ ...prev, fullAmount: fullAmount.toFixed(2) }))
  }, [formData.unitPrice, formData.quantity])

  const handleFileUpload = async (files: FileList) => {
    if (!currentUser) {
      setError('User information is still loading. Please try again shortly.')
      return
    }

    const fileArray = Array.from(files)
    const maxSize = 10 * 1024 * 1024 // 10MB
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
        setError(`File ${file.name} is too large. Maximum size is 10MB.`)
        return
      }
      if (!allowedTypes.includes(file.type)) {
        setError(`File type ${file.type} is not allowed for ${file.name}`)
        return
      }
    }

    try {
      setUploading(true)
      setError('')

      const uploadPromises = fileArray.map(async (file) => {
        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch('/api/uploads/attachments', {
          method: 'POST',
          body: formData
        })

        if (!response.ok) {
          throw new Error(`Failed to upload ${file.name}`)
        }

        const data = await response.json()
        return {
          name: file.name,
          url: data.url,
          size: file.size,
          type: file.type
        }
      })

      const uploadedFiles = await Promise.all(uploadPromises)
      setFormData(prev => ({
        ...prev,
        attachments: [...prev.attachments, ...uploadedFiles]
      }))
    } catch (err: any) {
      setError(err.message || 'Failed to upload files')
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
    setError('')

    if (!isFormValid) {
      setError('Please fill in all required fields')
      return
    }

    try {
      setLoading(true)

      const response = await fetch(`/api/projects/${projectId}/expenses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
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
            uploadedAt: new Date().toISOString()
          }))
        })
      })

      const data = await response.json()

      if (data.success) {
        showToast({ title: 'Expense added successfully', type: 'success' })
        // Reset form
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
        onSuccess()
        onClose()
      } else {
        setError(data.error || 'Failed to add expense')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to add expense')
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
            Add New Expense
          </DialogTitle>
          <DialogDescription className="text-muted-foreground ml-11">
            Record a new project expense. Fill in the details below.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="px-6 pt-4">
            <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-8">
          {/* Basic Information Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Tag className="h-4 w-4" /> Basic Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    <SelectItem value="labor">Labor</SelectItem>
                    <SelectItem value="materials">Materials</SelectItem>
                    <SelectItem value="overhead">Overhead</SelectItem>
                    <SelectItem value="external">External Services</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
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
                <Input
                  id="paidBy"
                  value={formData.paidBy}
                  onChange={(e) => setFormData(prev => ({ ...prev, paidBy: e.target.value }))}
                  placeholder="Enter who paid for this expense"
                  className="h-10"
                  required
                />
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
                "border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer",
                isDragging
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
              )}
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setIsDragging(false)
                if (e.dataTransfer.files.length > 0) {
                  handleFileUpload(e.dataTransfer.files)
                }
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex flex-col items-center gap-3">
                <div className="p-3 rounded-full bg-muted">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    <span className="text-primary hover:underline">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PDF, Images, Excel, Word (max 10MB)
                  </p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFileUpload(e.target.files)
                  }
                }}
              />
            </div>

            {formData.attachments.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                {formData.attachments.map((attachment, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg bg-background group hover:border-primary/30 transition-colors">
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
                      className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveAttachment(index)
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-3 pt-6 border-t border-border/50">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || uploading || !isFormValid}
              className="min-w-[120px]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Expense'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

