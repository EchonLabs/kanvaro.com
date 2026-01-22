'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { useTheme } from 'next-themes'
import {
  ArrowLeft,
  Zap,
  Moon,
  Sun,
  MessageSquare,
  ThumbsUp,
  Bug,
  Lightbulb,
  Send,
  Star,
  Loader2
} from 'lucide-react'

const feedbackCategories = [
  { id: 'feature', label: 'Feature Request', icon: Lightbulb, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { id: 'bug', label: 'Bug Report', icon: Bug, color: 'text-red-500', bg: 'bg-red-500/10' },
  { id: 'improvement', label: 'Improvement', icon: ThumbsUp, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { id: 'other', label: 'Other', icon: MessageSquare, color: 'text-purple-500', bg: 'bg-purple-500/10' }
]

export default function FeedbackPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    email: ''
  })
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')

    try {
      const category = feedbackCategories.find(c => c.id === selectedCategory)?.label || 'Feedback'
      
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category,
          title: formData.title,
          description: formData.description,
          email: formData.email,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit feedback')
      }

      setSubmitted(true)
      setFormData({ title: '', description: '', email: '' })
      setSelectedCategory('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit feedback. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f6fb] text-slate-900 dark:bg-[#040714] dark:text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-white/10 dark:bg-[#040714]/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => router.push('/landing')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <button
              onClick={() => router.push('/landing')}
              className="flex items-center gap-2 text-xl font-bold cursor-pointer group"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#7bffde] to-[#7afdea] shadow-lg shadow-[#7bffde]/30">
                <Zap className="h-5 w-5 text-slate-900" />
              </div>
              <span className="bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-white/80 bg-clip-text text-transparent">
                Kanvaro
              </span>
            </button>
          </div>
          
          {mounted && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-1 dark:border-white/20 dark:bg-white/5">
              <button
                onClick={() => setTheme('light')}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  theme === 'light'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-white/70'
                }`}
              >
                <Sun className="h-3.5 w-3.5" />
                Light
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  theme === 'dark'
                    ? 'bg-white text-slate-900'
                    : 'text-slate-600 hover:text-slate-900 dark:text-white/70'
                }`}
              >
                <Moon className="h-3.5 w-3.5" />
                Dark
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden px-6 py-20">
        <div className="absolute inset-0 bg-gradient-to-br from-[#f4f8ff] via-[#ffffff] to-[#e8eeff] dark:from-[#050c1d] dark:via-[#0a1030] dark:to-[#071328]" />
        <div className="relative mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#0d9488]/10 dark:bg-[#7bffde]/20 px-4 py-2 mb-6">
            <Star className="h-4 w-4 text-[#0d9488] dark:text-[#7bffde]" />
            <span className="text-sm font-semibold text-[#0d9488] dark:text-[#7bffde]">We Value Your Input</span>
          </div>
          <h1 className="text-4xl font-bold sm:text-5xl lg:text-6xl">
            <span className="bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-white/80 bg-clip-text text-transparent">
              Share Your Feedback
            </span>
          </h1>
          <p className="mt-6 text-lg text-slate-600 dark:text-white/80 max-w-2xl mx-auto">
            Help us make Kanvaro better. Submit feature requests, report bugs, or share your ideas for improvements.
          </p>
        </div>
      </section>

      {/* Feedback Form */}
      <section className="px-6 pt-12 pb-20">
        <div className="mx-auto max-w-2xl">
          {submitted ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center dark:border-white/10 dark:bg-[#0f1329]">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 mb-6">
                <ThumbsUp className="h-8 w-8 text-emerald-500" />
              </div>
              <h2 className="text-2xl font-bold mb-4">Thank You!</h2>
              <p className="text-slate-600 dark:text-white/70 mb-8">
                Your feedback has been submitted. We appreciate you taking the time to help us improve Kanvaro.
              </p>
              <Button
                onClick={() => { setSubmitted(false); setFormData({ title: '', description: '', email: '' }); setSelectedCategory(''); }}
                className="rounded-full"
              >
                Submit Another
              </Button>
            </div>
          ) : (
            <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-8 shadow-lg dark:border-white/10 dark:bg-[#0f1329]">
              <h2 className="text-2xl font-bold mb-6">Submit Feedback</h2>
              
              {/* Category Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-3">What type of feedback?</label>
                <div className="grid grid-cols-2 gap-3">
                  {feedbackCategories.map((category) => {
                    const Icon = category.icon
                    return (
                      <button
                        key={category.id}
                        onClick={() => setSelectedCategory(category.id)}
                        className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
                          selectedCategory === category.id
                            ? 'border-[#0d9488] bg-[#0d9488]/5 dark:border-[#7bffde] dark:bg-[#7bffde]/10'
                            : 'border-slate-200 hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20'
                        }`}
                      >
                        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${category.bg}`}>
                          <Icon className={`h-5 w-5 ${category.color}`} />
                        </div>
                        <span className="font-medium">{category.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-600 dark:text-red-400">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-2">Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-[#0d9488] focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 dark:border-white/20 dark:bg-white/5 dark:focus:border-[#7bffde] dark:focus:ring-[#7bffde]/20"
                    placeholder="Brief summary of your feedback"
                    required
                    disabled={isSubmitting}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={6}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-[#0d9488] focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 dark:border-white/20 dark:bg-white/5 dark:focus:border-[#7bffde] dark:focus:ring-[#7bffde]/20 resize-none"
                    placeholder="Provide details about your feedback. For bug reports, include steps to reproduce the issue."
                    required
                    disabled={isSubmitting}
                  />
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2">Email (optional)</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-[#0d9488] focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 dark:border-white/20 dark:bg-white/5 dark:focus:border-[#7bffde] dark:focus:ring-[#7bffde]/20"
                    placeholder="your@email.com (for follow-up)"
                    disabled={isSubmitting}
                  />
                </div>

                <div className="mt-12">
                  <Button
                    type="submit"
                    disabled={!selectedCategory || isSubmitting}
                    className="w-full h-12 rounded-xl bg-[#0d9488] dark:bg-[#7bffde] text-white dark:text-slate-900 hover:bg-[#0f766e] dark:hover:bg-[#5ce8c5] disabled:opacity-50"
                  >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Submit Feedback
                    </>
                  )}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Alternative Options */}
          <div className="mt-12 text-center">
            <p className="text-sm text-slate-500 dark:text-white/60 mb-4">
              You can also submit feedback via:
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button
                variant="outline"
                onClick={() => window.open('https://github.com/EchonLabs/kanvaro.com/issues', '_blank')}
                className="rounded-full"
              >
                GitHub Issues
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open('https://github.com/EchonLabs/kanvaro.com', '_blank')}
                className="rounded-full"
              >
                GitHub Repository
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

