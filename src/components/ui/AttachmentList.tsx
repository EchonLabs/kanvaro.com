'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { 
  Download, 
  Trash2, 
  Eye, 
  File, 
  Image, 
  FileText, 
  Archive,
  Calendar,
  User,
  X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

interface Attachment {
  name: string
  url: string
  size: number
  type: string
  uploadedBy: string
  uploadedAt: string
}

interface AttachmentListProps {
  attachments: Attachment[]
  onDelete?: (index: number) => void
  onDownload?: (attachment: Attachment) => void
  onPreview?: (attachment: Attachment) => void
  className?: string
  showUploader?: boolean
  canDelete?: boolean
}

export function AttachmentList({
  attachments,
  onDelete,
  onDownload,
  onPreview,
  className,
  showUploader = false,
  canDelete = true
}: AttachmentListProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) {
      return <Image className="h-4 w-4" />
    }
    if (type.includes('pdf') || type.includes('document') || type.includes('text')) {
      return <FileText className="h-4 w-4" />
    }
    return <File className="h-4 w-4" />
  }

  const isImage = (type: string) => type.startsWith('image/')

  const handlePreview = (attachment: Attachment) => {
    if (isImage(attachment.type)) {
      setPreviewUrl(attachment.url)
    } else if (onPreview) {
      onPreview(attachment)
    }
  }

  const handleDownload = (attachment: Attachment) => {
    if (onDownload) {
      onDownload(attachment)
    } else {
      // Default download behavior
      const link = document.createElement('a')
      link.href = attachment.url
      link.download = attachment.name
      link.click()
    }
  }

  if (attachments.length === 0 && !showUploader) {
    return (
      <div className={cn('text-center py-8 text-muted-foreground', className)}>
        <Archive className="h-8 w-8 mx-auto mb-2" />
        <p className="text-sm">No attachments yet</p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Image attachments - show as thumbnail grid */}
      {attachments.some(a => isImage(a.type)) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {attachments.filter(a => isImage(a.type)).map((attachment, idx) => {
            const originalIndex = attachments.indexOf(attachment)
            return (
              <div key={`img-${idx}`} className="relative group rounded-lg border overflow-hidden bg-muted/30">
                <img
                  src={attachment.url}
                  alt={attachment.name}
                  className="w-full h-32 object-cover cursor-pointer transition-opacity group-hover:opacity-80"
                  onClick={() => setPreviewUrl(attachment.url)}
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewUrl(attachment.url)}
                    className="h-8 w-8 p-0 text-white hover:text-white hover:bg-white/20"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownload(attachment)}
                    className="h-8 w-8 p-0 text-white hover:text-white hover:bg-white/20"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {canDelete && onDelete && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(originalIndex)}
                      className="h-8 w-8 p-0 text-red-300 hover:text-red-300 hover:bg-white/20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="px-2 py-1">
                  <p className="text-[11px] text-muted-foreground truncate">{attachment.name}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Non-image attachments - show as file list (name only) */}
      {attachments.filter(a => !isImage(a.type)).map((attachment, idx) => {
        const originalIndex = attachments.indexOf(attachment)
        return (
          <Card key={`file-${idx}`} className="p-3">
            <CardContent className="p-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    {getFileIcon(attachment.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {attachment.name}
                    </p>
                    <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                      {attachment.size > 0 && (
                        <>
                          <span>{formatFileSize(attachment.size)}</span>
                          <span>•</span>
                        </>
                      )}
                      <span className="flex items-center">
                        <Calendar className="h-3 w-3 mr-1" />
                        {formatDistanceToNow(new Date(attachment.uploadedAt), { addSuffix: true })}
                      </span>
                      <span>•</span>
                      <span className="flex items-center">
                        <User className="h-3 w-3 mr-1" />
                        {attachment.uploadedBy}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-1">
                  {canDelete && onDelete && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(originalIndex)}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}

      {/* Image Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="relative max-w-4xl max-h-[90vh] p-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPreviewUrl(null)}
              className="absolute top-2 right-2 z-10 bg-black/50 text-white hover:bg-black/70"
            >
              <X className="h-4 w-4" />
            </Button>
            <img
              src={previewUrl}
              alt="Preview"
              className="max-w-full max-h-full object-contain"
            />
          </div>
        </div>
      )}
    </div>
  )
}
