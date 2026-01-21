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
  CheckCircle2,
  Circle,
  Clock,
  Rocket,
  Star,
  Target,
  Calendar
} from 'lucide-react'

const roadmapItems = [
  {
    quarter: 'Q4 2025',
    status: 'in-progress',
    items: [
      { title: 'Enhanced Gantt Charts', description: 'Interactive timeline view with drag-and-drop scheduling', status: 'in-progress' },
      { title: 'Mobile App (iOS/Android)', description: 'Native mobile apps for on-the-go project management', status: 'in-progress' },
      { title: 'Advanced Filtering', description: 'Custom filters and saved views for tasks and projects', status: 'completed' },
      { title: 'Bulk Operations', description: 'Edit multiple tasks and projects simultaneously', status: 'completed' }
    ]
  },
  {
    quarter: 'Q1 2026',
    status: 'planned',
    items: [
      { title: 'AI-Powered Insights', description: 'Smart suggestions for task prioritization and resource allocation', status: 'planned' },
      { title: 'Integration Marketplace', description: 'Connect with Slack, GitHub, Jira, and more', status: 'planned' },
      { title: 'Custom Dashboards', description: 'Build personalized dashboards with widgets', status: 'planned' },
      { title: 'Document Collaboration', description: 'Real-time collaborative document editing', status: 'planned' }
    ]
  },
  {
    quarter: 'Q2 2026',
    status: 'planned',
    items: [
      { title: 'Resource Planning', description: 'Visual resource allocation and capacity management', status: 'planned' },
      { title: 'Advanced Automations', description: 'Custom automation rules and workflows', status: 'planned' },
      { title: 'Client Portal', description: 'Dedicated portal for external stakeholders', status: 'planned' },
      { title: 'Enhanced Reporting', description: 'Custom report builder with advanced analytics', status: 'planned' }
    ]
  },
  {
    quarter: 'Future',
    status: 'exploring',
    items: [
      { title: 'Enterprise SSO', description: 'SAML and OIDC single sign-on support', status: 'exploring' },
      { title: 'White-labeling', description: 'Custom branding and domain support', status: 'exploring' },
      { title: 'Multi-workspace', description: 'Manage multiple organizations from one account', status: 'exploring' },
      { title: 'API v2', description: 'Enhanced REST and GraphQL API', status: 'exploring' }
    ]
  }
]

const statusConfig = {
  'completed': { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Completed' },
  'in-progress': { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'In Progress' },
  'planned': { icon: Target, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Planned' },
  'exploring': { icon: Star, color: 'text-purple-500', bg: 'bg-purple-500/10', label: 'Exploring' }
}

export default function RoadmapPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

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
      <section className="relative overflow-hidden px-6 py-20 pb-12">
        <div className="absolute inset-0 bg-gradient-to-br from-[#f4f8ff] via-[#ffffff] to-[#e8eeff] dark:from-[#050c1d] dark:via-[#0a1030] dark:to-[#071328]" />
        <div className="relative mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#0d9488]/10 dark:bg-[#7bffde]/20 px-4 py-2 mb-6">
            <Rocket className="h-4 w-4 text-[#0d9488] dark:text-[#7bffde]" />
            <span className="text-sm font-semibold text-[#0d9488] dark:text-[#7bffde]">Public Roadmap</span>
          </div>
          <h1 className="text-4xl font-bold sm:text-5xl lg:text-6xl">
            <span className="bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-white/80 bg-clip-text text-transparent">
              Product Roadmap
            </span>
          </h1>
          <p className="mt-6 text-lg text-slate-600 dark:text-white/80 max-w-2xl mx-auto">
            See what we're building next. This roadmap reflects our current priorities and may change based on community feedback.
          </p>
        </div>
      </section>

      {/* Status Legend */}
      <section className="px-6 pb-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap justify-center gap-4">
            {Object.entries(statusConfig).map(([key, config]) => {
              const Icon = config.icon
              return (
                <div key={key} className={`flex items-center gap-2 rounded-full ${config.bg} px-4 py-2`}>
                  <Icon className={`h-4 w-4 ${config.color}`} />
                  <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Roadmap Timeline */}
      <section className="px-6 pb-20">
        <div className="mx-auto max-w-6xl">
          <div className="space-y-12">
            {roadmapItems.map((quarter, idx) => {
              const quarterStatus = statusConfig[quarter.status as keyof typeof statusConfig]
              return (
                <div key={quarter.quarter} className="relative">
                  {/* Timeline connector */}
                  {idx < roadmapItems.length - 1 && (
                    <div className="absolute left-6 top-20 bottom-[-3rem] w-0.5 bg-gradient-to-b from-slate-200 via-slate-300 to-slate-200 dark:from-white/10 dark:via-white/20 dark:to-white/10 hidden md:block" />
                  )}
                  
                  <div className="flex flex-col md:flex-row gap-6">
                    {/* Quarter Header */}
                    <div className="md:w-48 flex-shrink-0">
                      <div className="flex items-center gap-3 md:flex-col md:items-start">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${quarterStatus.bg}`}>
                          <Calendar className={`h-6 w-6 ${quarterStatus.color}`} />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold">{quarter.quarter}</h2>
                          <span className={`text-sm font-medium ${quarterStatus.color}`}>
                            {quarterStatus.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Items Grid */}
                    <div className="flex-1 grid gap-4 md:grid-cols-2">
                      {quarter.items.map((item) => {
                        const itemStatus = statusConfig[item.status as keyof typeof statusConfig]
                        const Icon = itemStatus.icon
                        return (
                          <div
                            key={item.title}
                            className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-[#0f1329] hover:shadow-lg transition-shadow"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <h3 className="font-bold text-lg">{item.title}</h3>
                              <div className={`rounded-full p-1.5 ${itemStatus.bg}`}>
                                <Icon className={`h-4 w-4 ${itemStatus.color}`} />
                              </div>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-white/70">
                              {item.description}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Vote CTA */}
      <section className="px-6 pb-20">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-3xl bg-gradient-to-br from-[#0d9488] to-[#0f766e] dark:from-[#0f1329] dark:to-[#151c3d] p-8 md:p-12 text-center text-white dark:border dark:border-white/10">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Have a Feature Request?</h2>
            <p className="text-white/80 mb-8 max-w-xl mx-auto">
              We build for our community. Submit your ideas and vote on features you'd like to see in Kanvaro.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                onClick={() => router.push('/feedback')}
                className="rounded-full bg-white text-[#0d9488] hover:bg-white/90 px-8"
              >
                Submit Feature Request
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open('https://github.com/EchonLabs/kanvaro.com/discussions', '_blank')}
                className="rounded-full border-white/30 bg-white/5 text-white hover:bg-white hover:text-[#0d9488] dark:hover:text-slate-900 px-8 font-semibold"
              >
                Join Discussion
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

