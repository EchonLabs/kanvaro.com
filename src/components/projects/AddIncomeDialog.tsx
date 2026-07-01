'use client'

import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/Badge'
import { Calendar as CalendarIcon, CreditCard, DollarSign, Loader2, Paperclip, Upload, UserCheck, X } from 'lucide-react'
import { useNotify } from '@/lib/notify'
import { MemberPickerDialog } from './MemberPickerDialog'

type IncomeCategory = 'invoice' | 'consulting' | 'other'
type IncomeSubCategory = 'amc' | 'cr'
type IncomePaidStatus = 'paid' | 'unpaid'

type IncomeInput = {
  _id?: string
  invoiceNumber?: string
  category?: IncomeCategory
  subCategory?: IncomeSubCategory
  description?: string
  utilizableBudget?: number
  approvedDate?: string | Date
  actualStartDate?: string | Date
  paidStatus?: IncomePaidStatus
  receivedBy?: string
  attachments?: UploadedAttachment[]
}

interface AddIncomeDialogProps {
  open: boolean
  onClose: () => void
  projectId: string
  onSuccess: () => void
  income?: IncomeInput | null
}

type UploadedAttachment = {
  name: string
  url: string
  size: number
  type: string
  uploadedAt?: string
  uploadedBy?: string
}

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err) return err
  return fallback
}

export function AddIncomeDialog({ open, onClose, projectId, onSuccess, income }: AddIncomeDialogProps) {
  const { error: notifyError } = useNotify()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null)
  const [showMemberPicker, setShowMemberPicker] = useState(false)

  const [formData, setFormData] = useState({
    invoiceNumber: '',
    category: '' as IncomeCategory | '',
    subCategory: '' as IncomeSubCategory | '',
    description: '',
    utilizableBudget: '',
    approvedDate: '',
    actualStartDate: '',
    paidStatus: 'unpaid' as IncomePaidStatus,
    receivedBy: '',
    attachments: [] as UploadedAttachment[]
  })

  useEffect(() => {
    if (!open) return

    const isEditing = !!income?._id

    const toDateInputValue = (value?: string | Date) => {
      if (!value) return ''
      const date = value instanceof Date ? value : new Date(value)
      if (Number.isNaN(date.getTime())) return ''
      return date.toISOString().slice(0, 10)
    }

    setSubmitting(false)
    setUploading(false)
    setFormData({
      invoiceNumber: isEditing ? String(income?.invoiceNumber || '') : '',
      category: isEditing ? (income?.category || '') : '',
      subCategory: isEditing ? (income?.subCategory || '') : '',
      description: isEditing ? String(income?.description || '') : '',
      utilizableBudget:
        isEditing && income?.utilizableBudget !== undefined && income?.utilizableBudget !== null
          ? String(income.utilizableBudget)
          : '',
      approvedDate: isEditing ? toDateInputValue(income?.approvedDate) : '',
      actualStartDate: isEditing ? toDateInputValue(income?.actualStartDate) : '',
      paidStatus: isEditing ? (income?.paidStatus || 'unpaid') : 'unpaid',
      receivedBy: isEditing ? (income?.receivedBy || '') : '',
      attachments: isEditing && Array.isArray(income?.attachments) ? income.attachments ?? [] : []
    })
  }, [open, income])

  useEffect(() => {
    if (!open) return

    const fetchCurrentUser = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) {
          const data: unknown = await res.json()
          const userId = (data as { id?: unknown })?.id
          if (typeof userId === 'string' && userId) {
            setCurrentUser({ id: userId })
            return
          }
        }
        setCurrentUser(null)
      } catch {
        setCurrentUser(null)
      }
    }

    void fetchCurrentUser()
  }, [open])

  const isInvoiceCategory = formData.category === 'invoice'

  const isFormValid =
    formData.invoiceNumber.trim() !== '' &&
    formData.category !== '' &&
    formData.description.trim() !== '' &&
    formData.utilizableBudget !== '' &&
    formData.approvedDate !== '' &&
    (!isInvoiceCategory || formData.subCategory !== '') &&
    (formData.paidStatus !== 'paid' || formData.receivedBy.trim() !== '')

  const handleFileUpload = async (files: FileList) => {
    const fileArray = Array.from(files)
    if (fileArray.length === 0) return

    try {
      setUploading(true)

      const uploadPromises = fileArray.map(async (file) => {
        const fd = new FormData()
        fd.append('attachment', file)

        const response = await fetch('/api/uploads/attachments', {
          method: 'POST',
          body: fd
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
          throw new Error(errorData.error || `Failed to upload ${file.name}`)
        }

        const data = await response.json()
        const fileData = data.data || data

        if (!fileData?.url) {
          throw new Error(`Upload failed for ${file.name}: missing URL`)
        }

        return {
          name: file.name,
          url: fileData.url,
          size: file.size,
          type: file.type
        } satisfies UploadedAttachment
      })

      const uploaded = await Promise.all(uploadPromises)

      setFormData(prev => ({
        ...prev,
        attachments: [...prev.attachments, ...uploaded]
      }))
    } catch (err: unknown) {
      notifyError({
        title: 'Upload Failed',
        message: getErrorMessage(err, 'Failed to upload attachment(s).')
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
        message: 'Please fill in all required fields.'
      })
      return
    }

    try {
      setSubmitting(true)

      const isEditing = !!income?._id
      const failureTitle = isEditing ? 'Failed to Update Income' : 'Failed to Add Income'

      const response = await fetch(`/api/projects/${projectId}/income`, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          incomeId: isEditing ? income?._id : undefined,
          invoiceNumber: formData.invoiceNumber.trim(),
          category: formData.category,
          subCategory: isInvoiceCategory ? formData.subCategory : undefined,
          description: formData.description,
          utilizableBudget: parseFloat(formData.utilizableBudget),
          approvedDate: formData.approvedDate,
          actualStartDate: formData.actualStartDate || undefined,
          paidStatus: formData.paidStatus,
          receivedBy: formData.paidStatus === 'paid' ? formData.receivedBy.trim() : undefined,
          attachments: formData.attachments.map(att => ({
            ...att,
            uploadedBy: currentUser?.id,
            uploadedAt: att.uploadedAt || new Date().toISOString()
          }))
        })
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        notifyError({
          title: failureTitle,
          message: data?.error || 'Request failed. Please try again.'
        })
        return
      }

      if (!data?.success) {
        notifyError({
          title: failureTitle,
          message: data?.error || 'Request failed. Please try again.'
        })
        return
      }

      onSuccess()
      onClose()
    } catch (err: unknown) {
      notifyError({
        title: income?._id ? 'Failed to Update Income' : 'Failed to Add Income',
        message: getErrorMessage(err, 'Request failed. Please try again.')
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        className="max-w-2xl p-0 gap-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="border-b border-border/50 bg-muted/20">
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <DollarSign className="h-5 w-5" />
            </div>
            {income?._id ? 'Edit Income' : 'Add Income'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground ml-11">
            {income?._id ? 'Update this income entry for the project.' : 'Record a new income entry for this project.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
          <DialogBody className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="invoiceNumber">Invoice Number <span className="text-destructive">*</span></Label>
              <Input
                id="invoiceNumber"
                value={formData.invoiceNumber}
                onChange={(e) => setFormData(prev => ({ ...prev, invoiceNumber: e.target.value }))}
                placeholder="Enter invoice number"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category <span className="text-destructive">*</span></Label>
              <Select
                value={formData.category}
                onValueChange={(value: IncomeCategory) => {
                  setFormData(prev => ({
                    ...prev,
                    category: value,
                    subCategory: value === 'invoice' ? prev.subCategory : ''
                  }))
                }}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="consulting">Consulting</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isInvoiceCategory && (
            <div className="space-y-2">
              <Label htmlFor="subCategory">Sub Category <span className="text-destructive">*</span></Label>
              <Select
                value={formData.subCategory}
                onValueChange={(value: IncomeSubCategory) => setFormData(prev => ({ ...prev, subCategory: value }))}
              >
                <SelectTrigger id="subCategory">
                  <SelectValue placeholder="Select sub category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="amc">AMC (Annual Maintenance Cost)</SelectItem>
                  <SelectItem value="cr">CR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="description">Description <span className="text-destructive">*</span></Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Enter description"
              rows={3}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="utilizableBudget">Utilizable Budget <span className="text-destructive">*</span></Label>
              <Input
                id="utilizableBudget"
                type="number"
                step="0.01"
                min="0"
                value={formData.utilizableBudget}
                onChange={(e) => setFormData(prev => ({ ...prev, utilizableBudget: e.target.value }))}
                placeholder="0.00"
                required
              />
            </div>

            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="approvedDate">Approved Date <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Input
                  id="approvedDate"
                  type="date"
                  value={formData.approvedDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, approvedDate: e.target.value }))}
                  className="pl-10"
                  required
                />
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="actualStartDate">Actual Start Date</Label>
              <div className="relative">
                <Input
                  id="actualStartDate"
                  type="date"
                  value={formData.actualStartDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, actualStartDate: e.target.value }))}
                  className="pl-10"
                />
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </div>

          {/* Payment Status */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> Payment Status
            </h3>
            <div className="space-y-2">
              <Label htmlFor="paidStatus">Receipt Status <span className="text-destructive">*</span></Label>
              <Select
                value={formData.paidStatus}
                onValueChange={(value: IncomePaidStatus) => {
                  setFormData(prev => ({ ...prev, paidStatus: value, receivedBy: value === 'unpaid' ? '' : prev.receivedBy }))
                }}
              >
                <SelectTrigger id="paidStatus">
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

            {formData.paidStatus === 'paid' && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Received By <span className="text-destructive">*</span></Label>
                {formData.receivedBy ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                    <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                      <UserCheck className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-medium flex-1">{formData.receivedBy}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground"
                      onClick={() => setFormData(prev => ({ ...prev, receivedBy: '' }))}
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-10 justify-start gap-2 text-muted-foreground"
                    onClick={() => setShowMemberPicker(true)}
                  >
                    <UserCheck className="h-4 w-4" />
                    Select a project member…
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Attachments</Label>
              <div className="flex items-center gap-2">
                <Input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) void handleFileUpload(e.target.files)
                    // allow re-selecting same file
                    e.target.value = ''
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload
                    </>
                  )}
                </Button>
              </div>
            </div>

            {formData.attachments.length === 0 ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Paperclip className="h-4 w-4" />
                No attachments uploaded
              </div>
            ) : (
              <div className="space-y-2">
                {formData.attachments.map((att, index) => (
                  <div key={`${att.url}-${index}`} className="flex items-center justify-between p-2 border rounded-md">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{att.name}</div>
                      <div className="text-xs text-muted-foreground">
                        <Badge variant="secondary" className="mr-2">{att.type || 'file'}</Badge>
                        {(att.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveAttachment(index)}
                      className="text-muted-foreground"
                      aria-label="Remove attachment"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          </DialogBody>

          <DialogFooter className="border-t border-border/50">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting || uploading}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isFormValid || submitting || uploading}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                income?._id ? 'Save Changes' : 'Add Income'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <MemberPickerDialog
      open={showMemberPicker}
      onClose={() => setShowMemberPicker(false)}
      projectId={projectId}
      title="Select Who Received Payment"
      description="Choose the project member who received this payment"
      onSelect={(member) => {
        setFormData(prev => ({
          ...prev,
          receivedBy: `${member.firstName} ${member.lastName}`
        }))
      }}
    />
    </>
  )
}
