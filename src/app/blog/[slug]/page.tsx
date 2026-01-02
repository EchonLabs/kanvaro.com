'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { useTheme } from 'next-themes'
import {
  ArrowLeft,
  Zap,
  Moon,
  Sun,
  Calendar,
  Clock,
  User,
  Tag,
  ArrowRight,
  Share2,
  Twitter,
  Linkedin,
  Link2
} from 'lucide-react'

const blogPosts: Record<string, {
  title: string
  excerpt: string
  content: string
  author: string
  date: string
  readTime: string
  category: string
  tags: string[]
  image: string
}> = {
  'getting-started-with-kanban-boards': {
    title: 'Getting Started with Kanban Boards in Kanvaro',
    excerpt: 'Learn how to set up and customize Kanban boards for your team.',
    content: `
# Getting Started with Kanban Boards in Kanvaro

Kanban boards are at the heart of visual task management, and Kanvaro's implementation gives you the flexibility and power you need to manage any workflow.

## What is a Kanban Board?

A Kanban board is a visual tool that helps teams manage work by visualizing tasks as cards moving through columns representing different stages of work. The word "Kanban" comes from Japanese and means "visual signal" or "card."

## Setting Up Your First Board

### Step 1: Access the Kanban View

Navigate to your project and click on the "Kanban" tab in the navigation. You'll see the default columns: To Do, In Progress, Review, and Done.

### Step 2: Customize Your Columns

Every team has a unique workflow. To customize your columns:

1. Click the settings icon in the header
2. Select "Column Settings"
3. Add, remove, or rename columns
4. Set WIP (Work in Progress) limits

### Step 3: Create Your First Task

Click the "+ Add Task" button in any column to create a new task. Fill in:

- **Title**: A clear, concise task name
- **Description**: Detailed information about the task
- **Assignee**: Who's responsible
- **Priority**: High, Medium, or Low
- **Story Points**: Effort estimation

## Best Practices

### 1. Limit Work in Progress

Set WIP limits on your columns to prevent bottlenecks. A good starting point is 3-5 items per person per column.

### 2. Keep Cards Moving

If a card hasn't moved in days, it's time to investigate. Regular standups help identify blocked items.

### 3. Use Labels and Tags

Color-coded labels help quickly identify task types, features, or priorities at a glance.

### 4. Regular Retrospectives

Use the data from your board to identify process improvements during sprint retrospectives.

## Advanced Features

- **Swimlanes**: Group tasks by epic, assignee, or priority
- **Quick Filters**: Filter by assignee, label, or date
- **Bulk Operations**: Move or edit multiple cards at once
- **Keyboard Shortcuts**: Speed up your workflow

## Conclusion

Kanvaro's Kanban boards give you the visual clarity and flexibility to manage any type of project. Start simple, and add complexity as your team grows.
    `,
    author: 'Kanvaro Team',
    date: '2025-12-01',
    readTime: '5 min read',
    category: 'Features',
    tags: ['Kanban', 'Workflows', 'Getting Started'],
    image: 'https://res.cloudinary.com/dichgutd0/image/upload/v1764044930/EL-Core-Assets/Static/Kanvaro/2_ocdtse.png'
  },
  'sprint-planning-best-practices': {
    title: 'Sprint Planning Best Practices for Agile Teams',
    excerpt: 'Master sprint planning with our comprehensive guide.',
    content: `
# Sprint Planning Best Practices for Agile Teams

Effective sprint planning is the foundation of successful agile delivery. Here's how to run sprint planning sessions that set your team up for success.

## Before the Planning Session

### Groom Your backlog

Ensure your product backlog is refined and ready:

- Stories should be small enough to complete in one sprint
- Acceptance criteria should be clear
- Dependencies should be identified
- Stories should be estimated

### Review Previous Sprint

Before planning the next sprint, review:

- What was completed?
- What wasn't completed and why?
- What was learned?

## During Sprint Planning

### Step 1: Set the Sprint Goal

Every sprint should have a clear, achievable goal that provides focus and direction. The sprint goal should be:

- Specific and measurable
- Achievable within the sprint
- Valuable to stakeholders

### Step 2: Calculate Capacity

Account for:

- Team member availability
- Holidays and time off
- Meetings and ceremonies
- Historical velocity

### Step 3: Select Stories

Based on your capacity, select stories from the backlog:

1. Start with the highest priority items
2. Consider dependencies
3. Balance work types (new features, bugs, tech debt)
4. Don't overcommit!

### Step 4: Break Down Tasks

For each selected story:

- Identify all tasks needed
- Estimate task hours
- Assign initial owners
- Identify blockers or risks

## Best Practices

### 1. Timeboxing

Keep sprint planning to a maximum of 2 hours for a 2-week sprint. Use a timer and stick to it.

### 2. Everyone Participates

Sprint planning is a team activity. Everyone should contribute to:

- Understanding stories
- Identifying tasks
- Estimating effort
- Committing to the sprint goal

### 3. Definition of Done

Make sure everyone knows what "done" means:

- Code complete
- Tests passing
- Code reviewed
- Documentation updated
- Deployed to staging

### 4. Leave Buffer

Don't plan to 100% capacity. Leave room for:

- Unexpected issues
- Support requests
- Learning and exploration

## Using Kanvaro for Sprint Planning

Kanvaro makes sprint planning easy with:

- Drag-and-drop backlog management
- Automatic velocity calculation
- Capacity planning tools
- Sprint burndown charts
- Story point tracking

## Conclusion

Great sprint planning leads to predictable delivery and happy teams. Take the time to plan well, and your sprints will run smoothly.
    `,
    author: 'Kanvaro Team',
    date: '2025-11-28',
    readTime: '7 min read',
    category: 'Agile',
    tags: ['Sprints', 'Agile', 'Planning'],
    image: 'https://res.cloudinary.com/dichgutd0/image/upload/v1764044928/EL-Core-Assets/Static/Kanvaro/3_1_benfd7.png'
  }
}

export default function BlogPostPage() {
  const router = useRouter()
  const params = useParams()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  
  const slug = params.slug as string
  const post = blogPosts[slug]

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!post) {
    return (
      <main className="min-h-screen bg-[#f4f6fb] dark:bg-[#040714] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Article Not Found</h1>
          <Button onClick={() => router.push('/blog')}>
            Return to Blog
          </Button>
        </div>
      </main>
    )
  }

  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''

  return (
    <main className="min-h-screen bg-[#f4f6fb] text-slate-900 dark:bg-[#040714] dark:text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-white/10 dark:bg-[#040714]/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => router.push('/blog')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Blog
            </Button>
            <button
              onClick={() => router.push('/landing')}
              className="flex items-center gap-2 text-xl font-bold cursor-pointer"
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
                  theme === 'light' ? 'bg-slate-900 text-white' : 'text-slate-600 dark:text-white/70'
                }`}
              >
                <Sun className="h-3.5 w-3.5" />
                Light
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  theme === 'dark' ? 'bg-white text-slate-900' : 'text-slate-600 dark:text-white/70'
                }`}
              >
                <Moon className="h-3.5 w-3.5" />
                Dark
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Article */}
      <article className="px-6 py-12">
        <div className="mx-auto max-w-3xl">
          {/* Header */}
          <header className="mb-8">
            <div className="flex items-center gap-4 mb-6">
              <span className="rounded-full bg-[#0d9488]/10 dark:bg-[#7bffde]/20 px-3 py-1 text-sm font-medium text-[#0d9488] dark:text-[#7bffde]">
                {post.category}
              </span>
              <span className="flex items-center gap-1 text-sm text-slate-500 dark:text-white/60">
                <Clock className="h-4 w-4" />
                {post.readTime}
              </span>
            </div>
            <h1 className="text-4xl font-bold mb-6">{post.title}</h1>
            <div className="flex items-center gap-6 text-sm text-slate-500 dark:text-white/60">
              <span className="flex items-center gap-2">
                <User className="h-4 w-4" />
                {post.author}
              </span>
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {new Date(post.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          </header>

          {/* Featured Image */}
          <div className="relative aspect-[16/9] rounded-2xl overflow-hidden mb-8">
            <Image
              src={post.image}
              alt={post.title}
              fill
              className="object-cover"
              unoptimized
            />
          </div>

          {/* Content */}
          <div className="prose prose-lg dark:prose-invert max-w-none">
            {post.content.split('\n').map((paragraph, idx) => {
              if (paragraph.startsWith('# ')) {
                return <h1 key={idx} className="text-3xl font-bold mt-8 mb-4">{paragraph.slice(2)}</h1>
              }
              if (paragraph.startsWith('## ')) {
                return <h2 key={idx} className="text-2xl font-bold mt-8 mb-4">{paragraph.slice(3)}</h2>
              }
              if (paragraph.startsWith('### ')) {
                return <h3 key={idx} className="text-xl font-bold mt-6 mb-3">{paragraph.slice(4)}</h3>
              }
              if (paragraph.startsWith('- ')) {
                return <li key={idx} className="ml-6 mb-2">{paragraph.slice(2)}</li>
              }
              if (paragraph.match(/^\d+\. /)) {
                return <li key={idx} className="ml-6 mb-2 list-decimal">{paragraph.slice(3)}</li>
              }
              if (paragraph.startsWith('**') && paragraph.endsWith('**')) {
                return <p key={idx} className="font-bold mb-4">{paragraph.slice(2, -2)}</p>
              }
              if (paragraph.trim() === '') return null
              return <p key={idx} className="mb-4 text-slate-700 dark:text-white/80 leading-relaxed">{paragraph}</p>
            })}
          </div>

          {/* Tags */}
          <div className="mt-12 pt-8 border-t border-slate-200 dark:border-white/10">
            <div className="flex items-center gap-2 mb-6">
              <Tag className="h-4 w-4 text-slate-500" />
              <span className="text-sm text-slate-500 dark:text-white/60">Tags:</span>
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-slate-100 dark:bg-white/10 px-3 py-1 text-sm text-slate-700 dark:text-white/80"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Share */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-500 dark:text-white/60 flex items-center gap-2">
                <Share2 className="h-4 w-4" />
                Share:
              </span>
              <button
                onClick={() => window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(post.title)}`, '_blank')}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
              >
                <Twitter className="h-5 w-5" />
              </button>
              <button
                onClick={() => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`, '_blank')}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
              >
                <Linkedin className="h-5 w-5" />
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(shareUrl)}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
              >
                <Link2 className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </article>

      {/* Related Articles CTA */}
      <section className="px-6 pb-20">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl bg-slate-100 dark:bg-[#0f1329] p-8 text-center">
            <h2 className="text-xl font-bold mb-4">Enjoyed this article?</h2>
            <p className="text-slate-600 dark:text-white/70 mb-6">
              Check out more articles on the Kanvaro blog for tips, tutorials, and best practices.
            </p>
            <Button onClick={() => router.push('/blog')} className="rounded-full">
              Browse All Articles
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
}

