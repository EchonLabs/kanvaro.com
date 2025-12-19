'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/Badge'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  BookOpen,
  Plus,
  Edit,
  Trash2,
  FileText,
  Users,
  Eye,
  Search,
  Upload,
  AlertCircle,
  CheckCircle,
  Loader2
} from 'lucide-react'
import { useNotify } from '@/lib/notify'
import { Audience, Category, Visibility } from '@/lib/docs/types'

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
  'self-hosting': 'Self-hosting'
}

const audienceLabels: Record<Audience, string> = {
  admin: 'Admin',
  project_manager: 'Project Manager',
  team_member: 'Team Member',
  client: 'Client',
  viewer: 'Viewer',
  self_host_admin: 'Self-host Admin'
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

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingArticle, setEditingArticle] = useState<DocArticle | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletingArticle, setDeletingArticle] = useState<DocArticle | null>(null)
  const { formatDate } = useDateTime()

  // Form states
  const [formData, setFormData] = useState({
    title: '',
    summary: '',
    slug: '',
    content: '',
    visibility: 'public' as Visibility,
    audiences: [] as Audience[],
    category: 'concepts' as Category,
    order: 1
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
    } catch (error) {
      notifyError({ title: 'Failed to Load Articles', message: 'Network error while loading articles' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadArticles()
  }, [])

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
    setFormData({
      title: '',
      summary: '',
      slug: '',
      content: '',
      visibility: 'public',
      audiences: [],
      category: 'concepts',
      order: Math.max(...articles.map(a => a.order), 0) + 10
    })
    setShowCreateModal(true)
  }

  const handleEditArticle = (article: DocArticle) => {
    setFormData({
      title: article.title,
      summary: article.summary,
      slug: article.slug,
      content: article.content || '',
      visibility: article.visibility,
      audiences: [...article.audiences],
      category: article.category,
      order: article.order
    })
    setEditingArticle(article)
    setShowEditModal(true)
  }

  const handleDeleteArticle = (article: DocArticle) => {
    setDeletingArticle(article)
    setShowDeleteModal(true)
  }

  const handleSaveArticle = async () => {
    if (!formData.title.trim() || !formData.slug.trim()) {
      notifyError({ title: 'Validation Error', message: 'Title and slug are required' })
      return
    }

    try {
      setSaving(true)
      const method = editingArticle ? 'PUT' : 'POST'
      const url = editingArticle ? `/api/docs/admin/${editingArticle.slug}` : '/api/docs/admin'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        notifySuccess({
          title: editingArticle ? 'Article Updated' : 'Article Created',
          message: `Documentation article "${formData.title}" has been ${editingArticle ? 'updated' : 'created'} successfully`
        })
        setShowCreateModal(false)
        setShowEditModal(false)
        setEditingArticle(null)
        loadArticles()
      } else {
        const error = await response.json()
        notifyError({
          title: 'Save Failed',
          message: error.message || 'Failed to save article'
        })
      }
    } catch (error) {
      notifyError({
        title: 'Save Failed',
        message: 'Network error while saving article'
      })
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deletingArticle) return

    try {
      const response = await fetch(`/api/docs/admin/${deletingArticle.slug}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        notifySuccess({
          title: 'Article Deleted',
          message: `Documentation article "${deletingArticle.title}" has been deleted`
        })
        setShowDeleteModal(false)
        setDeletingArticle(null)
        loadArticles()
      } else {
        notifyError({
          title: 'Delete Failed',
          message: 'Failed to delete article'
        })
      }
    } catch (error) {
      notifyError({
        title: 'Delete Failed',
        message: 'Network error while deleting article'
      })
    }
  }

  const toggleAudience = (audience: Audience) => {
    setFormData(prev => ({
      ...prev,
      audiences: prev.audiences.includes(audience)
        ? prev.audiences.filter(a => a !== audience)
        : [...prev.audiences, audience]
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Documentation Management
          </CardTitle>
          <CardDescription>
            Create, edit, and manage documentation articles for your users.
            Articles can be restricted by role and organized by category.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{articles.length}</div>
                <div className="text-sm text-muted-foreground">Total Articles</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{articles.filter(a => a.visibility === 'public').length}</div>
                <div className="text-sm text-muted-foreground">Public Articles</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-500" />
              <div>
                <div className="text-2xl font-bold">{articles.filter(a => a.visibility === 'internal').length}</div>
                <div className="text-sm text-muted-foreground">Internal Articles</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-orange-500" />
              <div>
                <div className="text-2xl font-bold">{Object.keys(categoryLabels).length}</div>
                <div className="text-sm text-muted-foreground">Categories</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Actions */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>Articles</CardTitle>
            <Button onClick={handleCreateArticle} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New Article
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Search and Filters */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="search">Search Articles</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search by title, summary, or slug..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={selectedCategory} onValueChange={(value) => setSelectedCategory(value as Category | 'all')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {Object.entries(categoryLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Audience</Label>
                <Select value={selectedAudience} onValueChange={(value) => setSelectedAudience(value as Audience | 'all')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Audiences</SelectItem>
                    {Object.entries(audienceLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Visibility</Label>
                <Select value={selectedVisibility} onValueChange={(value) => setSelectedVisibility(value as Visibility | 'all')}>
                  <SelectTrigger>
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

            {/* Articles List */}
            <div className="space-y-4">
              {filteredArticles.length === 0 ? (
                <div className="text-center py-8">
                  <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No articles found</h3>
                  <p className="text-muted-foreground mb-4">
                    {articles.length === 0 ? 'Create your first documentation article to get started.' : 'Try adjusting your filters.'}
                  </p>
                  {articles.length === 0 && (
                    <Button onClick={handleCreateArticle}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create First Article
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid gap-4">
                  {filteredArticles.map((article) => (
                    <Card key={article.slug}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-medium">{article.title}</h3>
                              <Badge variant={article.visibility === 'public' ? 'default' : 'secondary'}>
                                {article.visibility}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-3">{article.summary}</p>
                            <div className="flex flex-wrap gap-2 mb-3">
                              <Badge variant="outline">{categoryLabels[article.category]}</Badge>
                              {article.audiences.slice(0, 3).map(audience => (
                                <Badge key={audience} variant="secondary" className="text-xs">
                                  {audienceLabels[audience]}
                                </Badge>
                              ))}
                              {article.audiences.length > 3 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{article.audiences.length - 3} more
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Updated: {formatDate(article.updated)}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditArticle(article)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteArticle(article)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create Article Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Documentation Article</DialogTitle>
            <DialogDescription>
              Create a new documentation article with rich content and role-based access control.
            </DialogDescription>
          </DialogHeader>

          <ArticleForm
            formData={formData}
            setFormData={setFormData}
            toggleAudience={toggleAudience}
            onSave={handleSaveArticle}
            onCancel={() => setShowCreateModal(false)}
            saving={saving}
            isEdit={false}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Article Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Documentation Article</DialogTitle>
            <DialogDescription>
              Update the article content, metadata, and access permissions.
            </DialogDescription>
          </DialogHeader>

          <ArticleForm
            formData={formData}
            setFormData={setFormData}
            toggleAudience={toggleAudience}
            onSave={handleSaveArticle}
            onCancel={() => setShowEditModal(false)}
            saving={saving}
            isEdit={true}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Delete Article
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingArticle?.title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
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
}

function ArticleForm({ formData, setFormData, toggleAudience, onSave, onCancel, saving, isEdit }: ArticleFormProps) {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="metadata" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
        </TabsList>

        <TabsContent value="metadata" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Article title"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug *</Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-') })}
                placeholder="article-slug"
                required
                disabled={isEdit}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="summary">Summary</Label>
            <Textarea
              id="summary"
              value={formData.summary}
              onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
              placeholder="Brief description of the article"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(categoryLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select value={formData.visibility} onValueChange={(value) => setFormData({ ...formData, visibility: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="order">Order</Label>
              <Input
                id="order"
                type="number"
                value={formData.order}
                onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 1 })}
                min="1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Audiences (Roles that can view this article)</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(audienceLabels).map(([key, label]) => (
                <div key={key} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id={`audience-${key}`}
                    checked={formData.audiences.includes(key as Audience)}
                    onChange={() => toggleAudience(key as Audience)}
                    className="rounded"
                  />
                  <Label htmlFor={`audience-${key}`} className="text-sm">{label}</Label>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="content" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="content">Content (Markdown)</Label>
            <Textarea
              id="content"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Write your article content in Markdown format..."
              rows={20}
              className="font-mono text-sm"
            />
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Content should be written in Markdown format. You can include headings, lists, links, images, and code blocks.
            </AlertDescription>
          </Alert>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle className="h-4 w-4 mr-2" />
              {isEdit ? 'Update Article' : 'Create Article'}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
