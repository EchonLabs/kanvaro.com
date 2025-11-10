'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, ArrowLeft, CheckCircle } from 'lucide-react'


interface Story {
  _id: string
  title: string
  description: string
  status: 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  project: {
    _id: string
    name: string
  }
  epic?: {
    _id: string
    name: string
  }
  sprint?: {
    _id: string
    name: string
  }
  assignedTo?: {
    firstName: string
    lastName: string
    email: string
  }
  createdBy: {
    firstName: string
    lastName: string
    email: string
  }
  storyPoints?: number
  dueDate?: string
  estimatedHours?: number
  acceptanceCriteria: string[]
  tags: string[]
  createdAt: string
  updatedAt: string
}
export default function EditStoryPage() {
  const router = useRouter()
  const params = useParams()
  const storyId = params.id as string
  
  const [story, setStory] = useState<Story | null>(null)
  const [originalStory, setOriginalStory] = useState<Story | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const fetchStory = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/stories/${storyId}`)
      const data = await res.json()
      if (data.success) {
        setStory(data.data)
        setOriginalStory(data.data)
      } else {
        setError(data.error || 'Failed to load story')
      }
    } catch (e) {
      setError('Failed to load story')
    } finally {
      setLoading(false)
    }
  }, [storyId])

  useEffect(() => {
    if (storyId) fetchStory()
  }, [storyId, fetchStory])

  const handleSave = async () => {
    if (!story) return
    try {
      setSaving(true)
      const res = await fetch(`/api/stories/${storyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: story.title,
          description: story.description,
          status: story.status,
          priority: story.priority
        })
      })
      const data = await res.json()
      if (data.success) {
        setSuccess('Story updated successfully')
        setTimeout(() => setSuccess(''), 4000)

        setOriginalStory(story)
      } else {
        setError(data.error || 'Failed to save story')
      }
    } catch (e) {
      setError('Failed to save story')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading story...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (error || !story) {
    return (
      <MainLayout>
        <div className="max-w-2xl mx-auto">
          <Button variant="ghost" onClick={() => router.back()} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <Alert variant="destructive">
            <AlertDescription>{error || 'Story not found'}</AlertDescription>
          </Alert>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Edit Story</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input
                value={story.title}
                onChange={(e) => setStory({ ...story, title: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={story.description || ''}
                onChange={(e) => setStory({ ...story, description: e.target.value })}
                className="mt-1"
                rows={4}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">Status</label>
                <Select value={story.status} onValueChange={(v) => setStory({ ...story, status: v as Story['status'] })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">To Do</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="review">Review</SelectItem>
                    <SelectItem value="testing">Testing</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Priority</label>
                <Select value={story.priority} onValueChange={(v) => setStory({ ...story, priority: v as Story['priority'] })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {success && (
              <div className="w-full">
                <Alert className="w-full">
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                    <AlertDescription>{success}</AlertDescription>
                  </div>
                </Alert>
              </div>
            )}
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => router.push(`/stories`)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !(story && originalStory && (
                story.title !== originalStory.title ||
                (story.description || '') !== (originalStory.description || '') ||
                story.status !== originalStory.status ||
                story.priority !== originalStory.priority
              ))}>
                {saving ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>) : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
