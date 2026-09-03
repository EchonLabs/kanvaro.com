'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileText, Loader2, Plus, Search, ShieldCheck, Trash2, UploadCloud } from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { cn } from '@/lib/utils'

type DocumentTemplateItem = {
  _id: string
  name: string
  description: string
  fileName: string
  fileUrl: string
  size: number
  mimeType: string
  createdAt: string
}

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 KB'
  const sizes = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1)
  const value = bytes / 1024 ** index
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${sizes[index]}`
}

export default function DocumentTemplatesPage() {
  const { hasPermission, loading: permissionsLoading } = usePermissions()
  const canManageTemplates = hasPermission(Permission.DOCUMENTATION_MANAGE_PERMISSIONS)

  const [documents, setDocuments] = useState<DocumentTemplateItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [form, setForm] = useState({ name: '', description: '' })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const fetchTemplates = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/document-templates')
      if (!response.ok) {
        throw new Error('Failed to load document templates')
      }
      const data = await response.json()
      setDocuments(data.documents || [])
    } catch (err) {
      console.error(err)
      setError('Unable to load document templates right now.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchTemplates()
  }, [])

  const filteredDocuments = useMemo(() => {
    const term = searchQuery.trim().toLowerCase()
    if (!term) return documents
    return documents.filter((document) => {
      const haystack = `${document.name} ${document.description} ${document.fileName}`.toLowerCase()
      return haystack.includes(term)
    })
  }, [documents, searchQuery])

  const handleUpload = async () => {
    if (!selectedFile || !form.name.trim()) {
      setError('Please provide a document name and select a file.')
      return
    }

    try {
      setUploading(true)
      setError('')

      const formData  = new FormData()
      formData.append('name', form.name.trim())
      formData.append('description', form.description.trim())
      formData.append('file', selectedFile)

      const response = await fetch('/api/document-templates', {
        method: 'POST',
        body: formData,
      })

      const createResult = await response.json()
      if (!response.ok) {
        throw new Error(createResult?.error || 'Could not save the template.')
      }

      setForm({ name: '', description: '' })
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      await fetchTemplates()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Unexpected upload error.')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      setDeletingId(id)
      const response = await fetch(`/api/document-templates/${id}`, { method: 'DELETE' })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Unable to delete template.')
      }
      await fetchTemplates()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Unable to delete template.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <MainLayout>
        <div className="min-h-screen bg-[var(--apple-primary-background)] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
            <div className="rounded-[var(--apple-radius-xl)] border border-[var(--apple-separator)] bg-[var(--apple-card-background)] shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
            <div className="flex flex-col gap-4 border-b border-[var(--apple-separator)] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                <p className="apple-section-label mb-1">Company Documents</p>
                <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[var(--apple-label)]">Document Templates</h1>
                </div>
                <div className="flex items-center gap-2 text-[12px] text-[var(--apple-secondary-label)]">
                <FileText className="h-4 w-4" />
                {documents.length} files available
                </div>
            </div>

            <div className="px-5 py-4">
                <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--apple-tertiary-label)]" />
                <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search templates…"
                    className="h-10 border-[var(--apple-separator)] bg-[var(--apple-secondary-system-background)] pl-9 text-[14px]"
                />
                </div>
            </div>
            </div>

            {canManageTemplates && (
            <div className="rounded-[var(--apple-radius-xl)] border border-[var(--apple-separator)] bg-[var(--apple-card-background)] p-5 shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
                <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[var(--apple-system-blue)]/10 text-[var(--apple-system-blue)]">
                    <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                    <h2 className="text-[18px] font-semibold text-[var(--apple-label)]">Admin upload</h2>
                    <p className="text-[13px] text-[var(--apple-secondary-label)]">Add a standard company template for everyone to view and download.</p>
                </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                    <label className="text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--apple-secondary-label)]">Template name</label>
                    <Input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="SAD Template"
                    className="h-10 border-[var(--apple-separator)] bg-[var(--apple-secondary-system-background)]"
                    />
                </div>

                <div className="space-y-2 md:col-span-2">
                    <label className="text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--apple-secondary-label)]">Description</label>
                    <Textarea
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Briefly describe what this template is used for."
                    className="min-h-[96px] border-[var(--apple-separator)] bg-[var(--apple-secondary-system-background)]"
                    />
                </div>

                <div className="space-y-2 md:col-span-2">
                    <label className="text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--apple-secondary-label)]">Document file</label>
                    <div className="flex flex-col gap-3 rounded-[var(--apple-radius-md)] border border-dashed border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3 text-[14px] text-[var(--apple-secondary-label)]">
                        <UploadCloud className="h-5 w-5 text-[var(--apple-system-blue)]" />
                        <span className={cn(selectedFile ? 'text-[var(--apple-label)]' : '')}>{selectedFile ? selectedFile.name : 'No file selected yet'}</span>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        className="h-9 rounded-[10px] border-[var(--apple-separator)] bg-background"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        Choose file
                    </Button>
                    </div>
                </div>
                </div>

                {error && (
                <div className="mt-4 rounded-[var(--apple-radius-md)] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                    {error}
                </div>
                )}

                <div className="mt-4 flex justify-end">
                <Button
                    onClick={handleUpload}
                    disabled={uploading || !selectedFile || !form.name.trim()}
                    className="h-10 gap-2 rounded-[12px] px-4 text-[14px]"
                >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    {uploading ? 'Uploading...' : 'Upload template'}
                </Button>
                </div>
            </div>
            )}

            <div className="rounded-[var(--apple-radius-xl)] border border-[var(--apple-separator)] bg-[var(--apple-card-background)] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
            {loading || permissionsLoading ? (
                <div className="flex min-h-[180px] items-center justify-center text-[var(--apple-secondary-label)]">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading templates…
                </div>
            ) : filteredDocuments.length === 0 ? (
                <div className="flex min-h-[180px] flex-col items-center justify-center text-center">
                <FileText className="mb-3 h-12 w-12 text-[var(--apple-tertiary-label)]" />
                <h3 className="text-[18px] font-semibold text-[var(--apple-label)]">No templates available</h3>
                <p className="mt-1 max-w-md text-[14px] text-[var(--apple-secondary-label)]">
                    {canManageTemplates
                    ? 'Upload a company standard document to make it available to the whole team.'
                    : 'No template has been published yet. Please check back later.'}
                </p>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredDocuments.map((document) => (
                    <div key={document._id} className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-[var(--apple-primary-background)] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
                    <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[var(--apple-system-blue)]/10 text-[var(--apple-system-blue)]">
                            <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="truncate text-[16px] font-semibold text-[var(--apple-label)]">{document.name}</h3>
                            <p className="text-[12px] text-[var(--apple-secondary-label)]">{formatBytes(document.size)}</p>
                        </div>
                        </div>

                        {canManageTemplates && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full text-[var(--apple-system-red)] hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
                            onClick={() => handleDelete(document._id)}
                            disabled={deletingId === document._id}
                            aria-label={`Delete ${document.name}`}
                        >
                            {deletingId === document._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                        )}
                    </div>

                    <p className="mb-4 min-h-[40px] text-[13px] leading-5 text-[var(--apple-secondary-label)]">
                        {document.description || 'No description provided.'}
                    </p>

                    <div className="mb-4 rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-[var(--apple-secondary-system-background)] px-3 py-2 text-[12px] text-[var(--apple-tertiary-label)]">
                        {document.fileName}
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-2">
                        <span className="text-[11px] uppercase tracking-[0.06em] text-[var(--apple-tertiary-label)]">
                        {new Date(document.createdAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                        })}
                        </span>
                        <a
                        href={document.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--apple-card-gradient)] px-3 py-2 text-[12px] font-medium text-white shadow-sm transition-opacity hover:opacity-90"
                        >
                        <Download className="h-3.5 w-3.5" />
                        Download
                        </a>
                    </div>
                    </div>
                ))}
                </div>
            )}
            </div>
        </div>
        </div>
    </MainLayout>
  )
}
