'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { useTheme } from 'next-themes'
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  Tag,
  Search,
  Zap,
  Moon,
  Sun,
  ArrowRight,
  Layers,
  ListChecks,
  Watch,
  BarChart3,
  Users,
  Shield
} from 'lucide-react'

const blogPosts = [
  {
    id: 1,
    slug: 'getting-started-with-kanban-boards',
    title: 'Getting Started with Kanban Boards in Kanvaro',
    excerpt: 'Learn how to set up and customize Kanban boards for your team. Discover best practices for visualizing workflow, limiting work in progress, and improving team efficiency.',
    content: '',
    author: 'Kanvaro Team',
    date: '2025-12-01',
    readTime: '5 min read',
    category: 'Features',
    tags: ['Kanban', 'Workflows', 'Getting Started'],
    featured: true,
    image: 'https://res.cloudinary.com/dichgutd0/image/upload/v1764044930/EL-Core-Assets/Static/Kanvaro/2_ocdtse.png'
  },
  {
    id: 2,
    slug: 'sprint-planning-best-practices',
    title: 'Sprint Planning Best Practices for Agile Teams',
    excerpt: 'Master sprint planning with our comprehensive guide. From backlog grooming to velocity tracking, learn how to run effective sprints that deliver value consistently.',
    content: '',
    author: 'Kanvaro Team',
    date: '2025-11-28',
    readTime: '7 min read',
    category: 'Agile',
    tags: ['Sprints', 'Agile', 'Planning'],
    featured: true,
    image: 'https://res.cloudinary.com/dichgutd0/image/upload/v1764044928/EL-Core-Assets/Static/Kanvaro/3_1_benfd7.png'
  },
  {
    id: 3,
    slug: 'time-tracking-for-remote-teams',
    title: 'Effective Time Tracking for Remote Teams',
    excerpt: 'Discover how to implement time tracking that works for distributed teams. Learn about timers, manual logging, approval workflows, and generating accurate reports.',
    content: '',
    author: 'Kanvaro Team',
    date: '2025-11-25',
    readTime: '6 min read',
    category: 'Time Tracking',
    tags: ['Remote Work', 'Time Tracking', 'Productivity'],
    featured: false,
    image: 'https://res.cloudinary.com/dichgutd0/image/upload/v1764044928/EL-Core-Assets/Static/Kanvaro/4_jwnslu.png'
  },
  {
    id: 4,
    slug: 'role-based-permissions-guide',
    title: 'Setting Up Role-Based Permissions in Kanvaro',
    excerpt: 'Secure your workspace with granular permissions. Learn how to create custom roles, assign permissions, and manage team access for maximum security and flexibility.',
    content: '',
    author: 'Kanvaro Team',
    date: '2025-11-22',
    readTime: '8 min read',
    category: 'Security',
    tags: ['Permissions', 'Security', 'Team Management'],
    featured: false,
    image: 'https://res.cloudinary.com/dichgutd0/image/upload/v1764044929/EL-Core-Assets/Static/Kanvaro/5_1_dpjhwk.png'
  },
  {
    id: 5,
    slug: 'financial-reporting-overview',
    title: 'Financial Reporting and Budget Tracking',
    excerpt: 'Take control of project finances with comprehensive reporting. Track budgets, monitor expenses, generate invoices, and analyze ROI with real-time analytics.',
    content: '',
    author: 'Kanvaro Team',
    date: '2025-11-19',
    readTime: '6 min read',
    category: 'Reports',
    tags: ['Finance', 'Budgets', 'Analytics'],
    featured: false,
    image: 'https://res.cloudinary.com/dichgutd0/image/upload/v1764044929/EL-Core-Assets/Static/Kanvaro/1_qpvyfp.png'
  },
  {
    id: 6,
    slug: 'self-hosting-kanvaro-docker',
    title: 'Self-Hosting Kanvaro with Docker',
    excerpt: 'Complete guide to deploying Kanvaro on your own infrastructure. Step-by-step Docker setup, database configuration, and production best practices.',
    content: '',
    author: 'Kanvaro Team',
    date: '2025-11-15',
    readTime: '10 min read',
    category: 'Deployment',
    tags: ['Docker', 'Self-Hosting', 'DevOps'],
    featured: true,
    image: 'https://res.cloudinary.com/dichgutd0/image/upload/v1764044930/EL-Core-Assets/Static/Kanvaro/6_n6p2bu.png'
  }
]

const categories = ['All', 'Features', 'Agile', 'Time Tracking', 'Security', 'Reports', 'Deployment']

export default function BlogPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [subscribeSuccess, setSubscribeSuccess] = useState(false)
  const [subscribedEmails, setSubscribedEmails] = useState<string[]>(['test@example.com', 'user@domain.com']) // Simulated existing subscribers

  useEffect(() => {
    setMounted(true)
  }, [])

  const filteredPosts = blogPosts.filter(post => {
    const matchesSearch = post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesCategory = selectedCategory === 'All' || post.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailError('')
    
    if (!email.trim()) {
      setEmailError('Email is required')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setEmailError('Please enter a valid email address')
      return
    }

    setIsSubscribing(true)
    try {
      // In production, this would call an API to subscribe the email
      // For now, simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Check if already subscribed (simulated)
      if (subscribedEmails.includes(email.toLowerCase())) {
        setEmailError('This email is already subscribed to our newsletter.')
        return
      }
      
      // Add email to subscribed list (simulated)
      setSubscribedEmails(prev => [...prev, email.toLowerCase()])
      
      setSubscribeSuccess(true)
      setEmail('')
      
      // Hide success message after 5 seconds
      setTimeout(() => setSubscribeSuccess(false), 5000)
    } catch (error) {
      setEmailError('Failed to subscribe. Please try again.')
    } finally {
      setIsSubscribing(false)
    }
  }

  const featuredPosts = blogPosts.filter(post => post.featured)

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
          <h1 className="text-4xl font-bold sm:text-5xl lg:text-6xl">
            <span className="bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-white/80 bg-clip-text text-transparent">
              Kanvaro Blog
            </span>
          </h1>
          <p className="mt-6 text-lg text-slate-600 dark:text-white/80 max-w-2xl mx-auto">
            Discover trending features, workflows, best practices, and tips to maximize your productivity with Kanvaro.
          </p>

          {/* Search */}
          <div className="mt-8 relative max-w-xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-full border border-slate-200 bg-white py-4 pl-12 pr-6 text-base shadow-lg focus:border-[#0d9488] focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 dark:border-white/20 dark:bg-white/5 dark:focus:border-[#7bffde] dark:focus:ring-[#7bffde]/20"
            />
          </div>

          {/* Categories */}
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  selectedCategory === category
                    ? 'bg-[#0d9488] text-white dark:bg-[#7bffde] dark:text-slate-900'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-white/80 dark:hover:bg-white/20'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Posts */}
      {selectedCategory === 'All' && searchQuery === '' && (
        <section className="px-6 pb-16">
          <div className="mx-auto max-w-7xl">
            <h2 className="text-2xl font-bold mb-8">Featured Articles</h2>
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {featuredPosts.map((post) => (
                <article
                  key={post.id}
                  className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg transition-all hover:-translate-y-2 hover:shadow-xl dark:border-white/10 dark:bg-[#0f1329] cursor-pointer"
                  onClick={() => router.push(`/blog/${post.slug}`)}
                >
                  <div className="aspect-[16/10] relative overflow-hidden">
                    <Image
                      src={post.image}
                      alt={post.title}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-110"
                      unoptimized
                    />
                    <div className="absolute top-4 left-4">
                      <span className="rounded-full bg-[#0d9488] dark:bg-[#7bffde] px-3 py-1 text-xs font-semibold text-white dark:text-slate-900">
                        Featured
                      </span>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-white/60 mb-3">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {new Date(post.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {post.readTime}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold mb-2 group-hover:text-[#0d9488] dark:group-hover:text-[#7bffde] transition-colors">
                      {post.title}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-white/70 line-clamp-2">
                      {post.excerpt}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {post.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-slate-100 dark:bg-white/10 px-2 py-1 text-xs text-slate-600 dark:text-white/70"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* All Posts */}
      <section className="px-6 pb-20">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-2xl font-bold mb-8">
            {selectedCategory === 'All' && searchQuery === '' ? 'All Articles' : `Results (${filteredPosts.length})`}
          </h2>
          {filteredPosts.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-lg text-slate-500 dark:text-white/60">No articles found matching your criteria.</p>
              <Button
                onClick={() => { setSearchQuery(''); setSelectedCategory('All'); }}
                className="mt-4"
              >
                Clear Filters
              </Button>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredPosts.map((post) => (
                <article
                  key={post.id}
                  className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-md transition-all hover:-translate-y-1 hover:shadow-lg dark:border-white/10 dark:bg-[#0f1329] cursor-pointer"
                  onClick={() => router.push(`/blog/${post.slug}`)}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="rounded-full bg-[#0d9488]/10 dark:bg-[#7bffde]/20 px-3 py-1 text-xs font-medium text-[#0d9488] dark:text-[#7bffde]">
                      {post.category}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-white/60">
                      {post.readTime}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold mb-2 group-hover:text-[#0d9488] dark:group-hover:text-[#7bffde] transition-colors line-clamp-2">
                    {post.title}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-white/70 line-clamp-3 mb-4">
                    {post.excerpt}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 dark:text-white/60">
                      {new Date(post.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="flex items-center gap-1 text-sm font-medium text-[#0d9488] dark:text-[#7bffde] group-hover:gap-2 transition-all">
                      Read more <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Newsletter CTA */}
      <section className="px-6 pb-20">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-3xl bg-gradient-to-br from-[#0d9488] to-[#0f766e] dark:from-[#0f1329] dark:to-[#151c3d] p-8 md:p-12 text-center text-white dark:border dark:border-white/10">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Stay Updated</h2>
            <p className="text-white/80 mb-8 max-w-xl mx-auto">
              Get the latest articles, tips, and updates delivered straight to your inbox.
            </p>
            <form onSubmit={handleSubscribe} className="max-w-md mx-auto">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      setEmailError('')
                    }}
                    placeholder="Enter your email"
                    className={`w-full rounded-full border px-6 py-3 text-white placeholder:text-white/60 focus:outline-none focus:ring-2 ${
                      emailError 
                        ? 'border-red-300 bg-red-500/20 focus:ring-red-300' 
                        : 'border-white/20 bg-white/10 focus:ring-white/30'
                    }`}
                    disabled={isSubscribing}
                  />
                  {emailError && (
                    <p className="mt-2 text-sm text-red-200 text-left px-6">{emailError}</p>
                  )}
                </div>
                <Button 
                  type="submit"
                  disabled={isSubscribing}
                  className="rounded-full bg-white text-[#0d9488] hover:bg-white/90 px-8 disabled:opacity-50"
                >
                  {isSubscribing ? 'Subscribing...' : 'Subscribe'}
                </Button>
              </div>
              {subscribeSuccess && (
                <div className="mt-4 rounded-full bg-white/20 backdrop-blur-sm px-6 py-3 text-white text-sm">
                  ✓ Successfully subscribed! Check your inbox for confirmation.
                </div>
              )}
            </form>
          </div>
        </div>
      </section>
    </main>
  )
}

