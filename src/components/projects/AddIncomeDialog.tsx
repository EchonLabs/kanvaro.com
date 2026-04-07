'use client'

import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/Badge'
import { Loader2, Upload, X, Paperclip, Calendar as CalendarIcon } from 'lucide-react'
import { useNotify } from '@/lib/notify'

type IncomeCategory = 'invoice' | 'consulting' | 'other'
type IncomeSubCategory = 'amc' | 'cr'

interface AddIncomeDialogProps {
  open: boolean
  onClose: () => void
  projectId: string
  onSuccess: () => void
}

type UploadedAttachment = {
  name: string
  url: string
  size: number
  type: string
  uploadedAt?: string
  uploadedBy?: string
}

export function AddIncomeDialog({ open, onClose, projectId, onSuccess }: AddIncomeDialogProps) {
  const { error: notifyError } = useNotify()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null)

  const [formData, setFormData] = useState({
    invoiceNumber: '',
    category: '' as IncomeCategory | '',
    subCategory: '' as IncomeSubCategory | '',
    description: '',
    utilizableBudget: '',
    approvedDate: '',
    actualStartDate: '',
    attachments: [] as UploadedAttachment[]
  })

  useEffect(() => {
    if (!open) return

    // Reset on open
    setSubmitting(false)
    setUploading(false)
    setFormData({
      invoiceNumber: '',
      category: '',
      subCategory: '',
      description: '',
      utilizableBudget: '',
      approvedDate: '',
      actualStartDate: '',
      attachments: []
    })

    // Fetch current user for attachment metadata (optional but consistent with expenses)
    const fetchCurrentUser = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) {
          const data = await res.json()
          setCurrentUser({ id: data.id })
        } else {
          setCurrentUser(null)
        }
      } catch {
        setCurrentUser(null)
      }
    }

    fetchCurrentUser()
  }, [open])

  const isInvoiceCategory = formData.category === 'invoice'

  const isFormValid =
    formData.invoiceNumber.trim() !== '' &&
    formData.category !== '' &&
    formData.description.trim() !== '' &&
    formData.utilizableBudget !== '' &&
    (!isInvoiceCategory || formData.subCategory !== '')

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
    } catch (err: any) {
      notifyError({
        title: 'Upload Failed',
        message: err?.message || 'Failed to upload attachment(s).'
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

      const response = await fetch(`/api/projects/${projectId}/income`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          invoiceNumber: formData.invoiceNumber.trim(),
          category: formData.category,
          subCategory: isInvoiceCategory ? formData.subCategory : undefined,
          description: formData.description,
          utilizableBudget: parseFloat(formData.utilizableBudget),
          approvedDate: formData.approvedDate || undefined,
          actualStartDate: formData.actualStartDate || undefined,
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
          title: 'Failed to Add Income',
          message: data?.error || 'Request failed. Please try again.'
        })
        return
      }

      if (!data?.success) {
        notifyError({
          title: 'Failed to Add Income',
          message: data?.error || 'Failed to add income. Please try again.'
        })
        return
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      notifyError({
        title: 'Failed to Add Income',
        message: err?.message || 'Failed to add income. Please try again.'
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Income</DialogTitle>
          <DialogDescription>
            Record a new income entry for this project.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-4 sm:pb-6 space-y-6"
        >
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
              <Label htmlFor="approvedDate">Approved Date</Label>
              <div className="relative">
                <Input
                  id="approvedDate"
                  type="date"
                  value={formData.approvedDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, approvedDate: e.target.value }))}
                  className="pl-10"
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

          <div className="flex justify-end gap-2 pt-2">
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
                'Add Income'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
