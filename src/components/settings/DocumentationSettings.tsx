'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/Badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import {
  BookOpen, Plus, Edit, Trash2, FileText, Users, Eye,
  Search, AlertCircle, CheckCircle, Loader2, Globe, Lock,
  Tag, Calendar,
} from 'lucide-react'
import { useNotify } from '@/lib/notify'
import { Audience, Category, Visibility } from '@/lib/docs/types'
import { cn } from '@/lib/utils'

interface DocArticle {
  slug: string
  title: string
  summary: string
  visibility: Visibility
  audiences: Audience[]
  category: Category
  order: number
  updated: string
  content?: string
}

const categoryLabels: Record<Category, string> = {
  concepts: 'Concepts',
  'how-to': 'How-to Guides',
  tutorial: 'Tutorials',
  reference: 'Reference',
  operations: 'Operations',
  'self-hosting': 'Self-hosting',
}

const audienceLabels: Record<Audience, string> = {
  admin: 'Admin',
  project_manager: 'Project Manager',
  team_member: 'Team Member',
  client: 'Client',
  viewer: 'Viewer',
  self_host_admin: 'Self-host Admin',
}

const CATEGORY_COLORS: Record<Category, string> = {
  concepts: 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  'how-to': 'bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800',
  tutorial: 'bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800',
  reference: 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  operations: 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800',
  'self-hosting': 'bg-cyan-50 dark:bg-cyan-950/30 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800',
}

export function DocumentationSettings() {
  const { success: notifySuccess, error: notifyError } = useNotify()
  const [articles, setArticles] = useState<DocArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<Category | 'all'>('all')
  const [selectedAudience, setSelectedAudience] = useState<Audience | 'all'>('all')
  const [selectedVisibility, setSelectedVisibility] = useState<Visibility | 'all'>('all')

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingArticle, setEditingArticle] = useState<DocArticle | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletingArticle, setDeletingArticle] = useState<DocArticle | null>(null)
  const { formatDate } = useDateTime()

  const [formData, setFormData] = useState({
    title: '', summary: '', slug: '', content: '',
    visibility: 'public' as Visibility,
    audiences: [] as Audience[],
    category: 'concepts' as Category,
    order: 1,
  })

  const loadArticles = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/docs?action=index')
      if (response.ok) {
        const data = await response.json()
        setArticles(data.nodes || [])
      } else {
        notifyError({ title: 'Failed to Load Articles', message: 'Could not fetch documentation articles' })
      }
    } catch {
      notifyError({ title: 'Failed to Load Articles', message: 'Network error while loading articles' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadArticles() }, [])

  const filteredArticles = articles.filter(article => {
    const matchesSearch = !searchQuery ||
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.slug.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || article.category === selectedCategory
    const matchesAudience = selectedAudience === 'all' || article.audiences.includes(selectedAudience)
    const matchesVisibility = selectedVisibility === 'all' || article.visibility === selectedVisibility
    return matchesSearch && matchesCategory && matchesAudience && matchesVisibility
  })

  const handleCreateArticle = () => {
    setFormData({ title: '', summary: '', slug: '', content: '', visibility: 'public', audiences: [], category: 'concepts', order: Math.max(...articles.map(a => a.order), 0) + 10 })
    setShowCreateModal(true)
  }

  const handleEditArticle = (article: DocArticle) => {
    setFormData({ title: article.title, summary: article.summary, slug: article.slug, content: article.content || '', visibility: article.visibility, audiences: [...article.audiences], category: article.category, order: article.order })
    setEditingArticle(article)
    setShowEditModal(true)
  }

  const handleDeleteArticle = (article: DocArticle) => { setDeletingArticle(article); setShowDeleteModal(true) }

  const validateForm = () => formData.title.trim() !== '' && formData.slug.trim() !== ''

  const handleSaveArticle = async () => {
    if (!validateForm()) { notifyError({ title: 'Validation Error', message: 'Title and slug are required' }); return }
    try {
      setSaving(true)
      const method = editingArticle ? 'PUT' : 'POST'
      const url = editingArticle ? `/api/docs/admin/${editingArticle.slug}` : '/api/docs/admin'
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) })
      if (response.ok) {
        notifySuccess({ title: editingArticle ? 'Article Updated' : 'Article Created', message: `"${formData.title}" has been ${editingArticle ? 'updated' : 'created'} successfully` })
        setShowCreateModal(false); setShowEditModal(false); setEditingArticle(null)
        loadArticles()
      } else {
        const error = await response.json()
        notifyError({ title: 'Save Failed', message: error.message || 'Failed to save article' })
      }
    } catch {
      notifyError({ title: 'Save Failed', message: 'Network error while saving article' })
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deletingArticle) return
    try {
      const response = await fetch(`/api/docs/admin/${deletingArticle.slug}`, { method: 'DELETE' })
      if (response.ok) {
        notifySuccess({ title: 'Article Deleted', message: `"${deletingArticle.title}" has been deleted` })
        setShowDeleteModal(false); setDeletingArticle(null); loadArticles()
      } else {
        notifyError({ title: 'Delete Failed', message: 'Failed to delete article' })
      }
    } catch {
      notifyError({ title: 'Delete Failed', message: 'Network error while deleting article' })
    }
  }

  const toggleAudience = (audience: Audience) => {
    setFormData(prev => ({
      ...prev,
      audiences: prev.audiences.includes(audience) ? prev.audiences.filter(a => a !== audience) : [...prev.audiences, audience],
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--apple-system-blue)]" />
      </div>
    )
  }

  const stats = [
    { label: 'Total Articles', value: articles.length, icon: FileText },
    { label: 'Public',         value: articles.filter(a => a.visibility === 'public').length,   icon: Globe    },
    { label: 'Internal',       value: articles.filter(a => a.visibility === 'internal').length, icon: Lock     },
    { label: 'Categories',     value: Object.keys(categoryLabels).length,                       icon: Tag      },
  ]

  return (
    <div className="space-y-5">

      {/* ── Stats Bar ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label}
            className="card-fade-in rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-4 flex items-center gap-3 apple-transition hover:shadow-[0_4px_16px_rgba(0,0,0,0.09)]">
            <div className="flex-shrink-0 w-10 h-10 rounded-[var(--apple-radius-sm)] flex items-center justify-center"
              style={{ background: 'var(--apple-card-gradient)', boxShadow: '0 4px 12px var(--apple-chart-glow)' }}>
              <Icon className="h-5 w-5 text-white" strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-[22px] font-bold tracking-tight text-[var(--apple-label)] font-apple-mono tabular-nums leading-none">{value}</p>
              <p className="text-[12px] text-[var(--apple-tertiary-label)] mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Articles card ── */}
      <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-b border-[var(--apple-separator)]">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-9 h-9 rounded-[var(--apple-radius-sm)] flex items-center justify-center"
              style={{ background: 'var(--apple-card-gradient)', boxShadow: '0 3px 10px var(--apple-chart-glow)' }}>
              <BookOpen className="h-[18px] w-[18px] text-white" strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-[var(--apple-label)]">Documentation Articles</p>
              <p className="text-[12px] text-[var(--apple-secondary-label)] mt-0.5">Create and manage articles for your users</p>
            </div>
          </div>
          <Button
            onClick={handleCreateArticle}
            className="w-full sm:w-auto h-9 gap-2 px-4 rounded-[var(--apple-radius-sm)] apple-transition text-[13px]"
            style={{ background: 'var(--apple-card-gradient)' }}
          >
            <Plus className="h-3.5 w-3.5" />
            New Article
          </Button>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)]">
          {/* Search — always full width */}
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--apple-tertiary-label)]" />
            <Input
              placeholder="Search articles…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-8 w-full text-[13px] rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-background"
            />
          </div>
          {/* Selects — 1-col on mobile, 3-col on sm+ */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as Category | 'all')}>
              <SelectTrigger className="h-8 w-full text-[13px] rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {Object.entries(categoryLabels).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={selectedAudience} onValueChange={(v) => setSelectedAudience(v as Audience | 'all')}>
              <SelectTrigger className="h-8 w-full text-[13px] rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Audiences</SelectItem>
                {Object.entries(audienceLabels).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={selectedVisibility} onValueChange={(v) => setSelectedVisibility(v as Visibility | 'all')}>
              <SelectTrigger className="h-8 w-full text-[13px] rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Visibility</SelectItem>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Articles list */}
        <div className="divide-y divide-[var(--apple-separator)]">
          {filteredArticles.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 rounded-[var(--apple-radius-md)] flex items-center justify-center mx-auto mb-4"
                style={{ background: 'var(--apple-card-gradient)', boxShadow: '0 4px 16px var(--apple-chart-glow)' }}>
                <BookOpen className="h-7 w-7 text-white" strokeWidth={1.8} />
              </div>
              <p className="text-[17px] font-semibold text-[var(--apple-label)] mb-1">
                {articles.length === 0 ? 'No articles yet' : 'No articles match filters'}
              </p>
              <p className="text-[13px] text-[var(--apple-secondary-label)] mb-5">
                {articles.length === 0 ? 'Create your first documentation article to get started.' : 'Try adjusting the search or filter options.'}
              </p>
              {articles.length === 0 && (
                <Button
                  onClick={handleCreateArticle}
                  className="h-9 gap-2 px-5 rounded-[var(--apple-radius-sm)] apple-transition text-[13px]"
                  style={{ background: 'var(--apple-card-gradient)' }}
                >
                  <Plus className="h-3.5 w-3.5" /> Create First Article
                </Button>
              )}
            </div>
          ) : (
            filteredArticles.map((article) => (
              <div
                key={article.slug}
                className="flex items-start gap-3 px-5 py-4 apple-transition hover:bg-[var(--apple-quaternary-fill)] group"
              >
                {/* Visibility indicator */}
                <div className={cn(
                  'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5',
                  article.visibility === 'public'
                    ? 'bg-green-100 dark:bg-green-950/40'
                    : 'bg-purple-100 dark:bg-purple-950/40'
                )}>
                  {article.visibility === 'public'
                    ? <Globe className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                    : <Lock className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                  }
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-[var(--apple-label)] truncate">{article.title}</p>
                      {article.summary && (
                        <p className="text-[12px] text-[var(--apple-secondary-label)] mt-0.5 line-clamp-2">{article.summary}</p>
                      )}
                    </div>
                    {/* Actions — visible on hover */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 apple-transition flex-shrink-0">
                      <button
                        onClick={() => handleEditArticle(article)}
                        className="w-7 h-7 rounded-[var(--apple-radius-sm)] flex items-center justify-center text-[var(--apple-secondary-label)] hover:bg-[var(--apple-tertiary-fill)] hover:text-[var(--apple-system-blue)] apple-transition"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteArticle(article)}
                        className="w-7 h-7 rounded-[var(--apple-radius-sm)] flex items-center justify-center text-[var(--apple-secondary-label)] hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-[var(--apple-system-red)] apple-transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Meta chips */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium', CATEGORY_COLORS[article.category])}>
                      {categoryLabels[article.category]}
                    </span>
                    {article.audiences.slice(0, 3).map(a => (
                      <span key={a} className="inline-flex items-center px-2 py-0.5 rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[11px] text-[var(--apple-secondary-label)]">
                        {audienceLabels[a]}
                      </span>
                    ))}
                    {article.audiences.length > 3 && (
                      <span className="text-[11px] text-[var(--apple-tertiary-label)]">+{article.audiences.length - 3}</span>
                    )}
                    <span className="ml-auto flex items-center gap-1 text-[11px] text-[var(--apple-tertiary-label)]">
                      <Calendar className="h-3 w-3" />
                      {formatDate(article.updated)}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {filteredArticles.length > 0 && (
          <div className="px-5 py-3 border-t border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)]">
            <p className="text-[12px] text-[var(--apple-tertiary-label)]">
              Showing {filteredArticles.length} of {articles.length} article{articles.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

      {/* ── Create Article Modal ── */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Documentation Article</DialogTitle>
            <DialogDescription>Create a new article with rich content and role-based access control.</DialogDescription>
          </DialogHeader>
          <ArticleForm
            formData={formData} setFormData={setFormData} toggleAudience={toggleAudience}
            onSave={handleSaveArticle} onCancel={() => setShowCreateModal(false)}
            saving={saving} isEdit={false} isValid={validateForm()}
          />
        </DialogContent>
      </Dialog>

      {/* ── Edit Article Modal ── */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Documentation Article</DialogTitle>
            <DialogDescription>Update the article content, metadata, and access permissions.</DialogDescription>
          </DialogHeader>
          <ArticleForm
            formData={formData} setFormData={setFormData} toggleAudience={toggleAudience}
            onSave={handleSaveArticle} onCancel={() => setShowEditModal(false)}
            saving={saving} isEdit={true} isValid={validateForm()}
          />
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Modal ── */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-[var(--apple-system-red)]" />
              Delete Article
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingArticle?.title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}
              className="rounded-[var(--apple-radius-sm)]">
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDelete}
              className="rounded-[var(--apple-radius-sm)]"
              style={{ background: 'linear-gradient(135deg,#FF3B30 0%,#FF453A 100%)' }}
            >
              Delete Article
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface ArticleFormProps {
  formData: any
  setFormData: (data: any) => void
  toggleAudience: (audience: Audience) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  isEdit: boolean
  isValid: boolean
}

function ArticleForm({ formData, setFormData, toggleAudience, onSave, onCancel, saving, isEdit, isValid }: ArticleFormProps) {
  return (
    <div className="space-y-5 mt-2">
      <Tabs defaultValue="metadata" className="w-full">
        {/* Pill tabs inside dialog */}
        <div className="flex">
          <div className="inline-flex items-center gap-1 p-1 rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)]">
            {[
              { value: 'metadata', label: 'Metadata' },
              { value: 'content', label: 'Content' },
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="px-4 py-1.5 rounded-full text-[13px] font-medium apple-transition data-[state=active]:bg-background data-[state=active]:text-[var(--apple-label)] data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-[var(--apple-separator)] data-[state=inactive]:text-[var(--apple-secondary-label)] data-[state=inactive]:hover:text-[var(--apple-label)] data-[state=inactive]:hover:bg-[var(--apple-tertiary-fill)]"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </div>
        </div>

        <TabsContent value="metadata" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="title" className="text-[13px] font-medium text-[var(--apple-label)]">Title *</Label>
              <Input id="title" value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Article title" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slug" className="text-[13px] font-medium text-[var(--apple-label)]">Slug *</Label>
              <Input id="slug" value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-') })}
                placeholder="article-slug" disabled={isEdit} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="summary" className="text-[13px] font-medium text-[var(--apple-label)]">Summary</Label>
            <Textarea id="summary" value={formData.summary}
              onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
              placeholder="Brief description of the article" rows={3} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-medium text-[var(--apple-label)]">Category</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(categoryLabels).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-medium text-[var(--apple-label)]">Visibility</Label>
              <Select value={formData.visibility} onValueChange={(v) => setFormData({ ...formData, visibility: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="order" className="text-[13px] font-medium text-[var(--apple-label)]">Order</Label>
              <Input id="order" type="number" value={formData.order}
                onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 1 })} min="1" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[13px] font-medium text-[var(--apple-label)]">Audiences</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(audienceLabels).map(([key, label]) => {
                const active = formData.audiences.includes(key as Audience)
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleAudience(key as Audience)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-[var(--apple-radius-sm)] border text-[13px] apple-transition text-left',
                      active
                        ? 'border-[var(--apple-system-blue)] bg-blue-50 dark:bg-blue-950/30 text-[var(--apple-system-blue)]'
                        : 'border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[var(--apple-secondary-label)] hover:bg-[var(--apple-tertiary-fill)]'
                    )}
                  >
                    <div className={cn('w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center',
                      active ? 'border-[var(--apple-system-blue)] bg-[var(--apple-system-blue)]' : 'border-[var(--apple-separator)]')}>
                      {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="content" className="space-y-3 mt-4">
          <div className="space-y-1.5">
            <Label htmlFor="content" className="text-[13px] font-medium text-[var(--apple-label)]">Content (Markdown)</Label>
            <Textarea id="content" value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Write your article content in Markdown format…"
              rows={20} className="font-mono text-sm" />
          </div>
          <div className="rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-4 py-3 flex gap-2">
            <AlertCircle className="h-4 w-4 text-[var(--apple-system-blue)] flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-[var(--apple-secondary-label)]">
              Content should be written in Markdown. You can include headings, lists, links, images, and code blocks.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-2 pt-4 border-t border-[var(--apple-separator)]">
        <Button variant="outline" onClick={onCancel} disabled={saving}
          className="h-9 px-4 rounded-[var(--apple-radius-sm)] text-[13px] border-[var(--apple-separator)]">
          Cancel
        </Button>
        <Button onClick={onSave} disabled={saving || !isValid}
          className="h-9 gap-2 px-4 rounded-[var(--apple-radius-sm)] text-[13px]"
          style={{ background: 'var(--apple-card-gradient)' }}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
          {saving ? 'Saving…' : isEdit ? 'Update Article' : 'Create Article'}
        </Button>
      </div>
    </div>
  )
}
