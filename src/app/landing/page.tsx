'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Layers,
  ListChecks,
  Play,
  Quote,
  Users,
  Watch,
  Mail,
  Phone,
  Linkedin,
  Twitter
} from 'lucide-react'

const stats = [
  { label: 'Teams onboarded', value: '4,200+', gradient: '#79ffe1, #15d1ff' },
  { label: 'Time saved weekly', value: '18 hrs', gradient: '#ffa8ff, #6a5dff' },
  { label: 'Automation accuracy', value: '99.2%', gradient: '#ffd479, #ff7a7a' }
]

const modules = [
  {
    icon: <ListChecks className="h-6 w-6 text-[#7bffde]" />,
    name: 'Tasks Workspace',
    description: 'Kanban, swimlanes, recurring tasks, SLAs, and approvals.',
    badge: 'Sprint-ready'
  },
  {
    icon: <Layers className="h-6 w-6 text-[#a0a7ff]" />,
    name: 'Projects & Epics',
    description: 'Cross-squad planning boards with dependencies and risk view.',
    badge: 'Portfolio lens'
  },
  {
    icon: <Users className="h-6 w-6 text-[#ffc7ff]" />,
    name: 'Members & Permissions',
    description: 'Invite contractors, map roles, and audit every decision.',
    badge: 'Granular roles'
  },
  {
    icon: <Watch className="h-6 w-6 text-[#9effff]" />,
    name: 'Time Logs & Capacity',
    description: 'Track billable hours, utilization, and capacity alerts live.',
    badge: 'Live signals'
  },
  {
    icon: <BarChart3 className="h-6 w-6 text-[#ffdd8f]" />,
    name: 'Reports & Insights',
    description: 'Executive dashboards with burn-up, forecasts, and OKR rollups.',
    badge: 'Exec-ready'
  },
  {
    icon: <Activity className="h-6 w-6 text-[#9fc5ff]" />,
    name: 'Automation Studio',
    description: 'Trigger notifications, workflows, and syncs across tools.',
    badge: 'No-code rules'
  }
]

const steps = [
  {
    title: 'Blueprint & Import',
    description:
      'Bring spreadsheets, Trello boards, or Jira projects. Kanvaro maps them to Workleze-style canvases instantly.',
    caption: '1. Build your operating model',
    gradient: '#2d2ef5, #6f55ff'
  },
  {
    title: 'Collaborate in Context',
    description: 'Create squads, assign flows, and host async standups inside every task and project.',
    caption: '2. Orchestrate sprint to sprint',
    gradient: '#0bbcd6, #19f2a5'
  },
  {
    title: 'Forecast & Celebrate',
    description: 'Surface delivery health, time tracking, and exec-ready updates in seconds.',
    caption: '3. Broadcast wins in a click',
    gradient: '#ff7ab6, #feae68'
  }
]

const showcases = [
  {
    name: 'Tasks',
    metric: '38 In-flight',
    detail: 'Grouped by squads with SLA timers and blockers surfaced instantly.'
  },
  {
    name: 'Projects',
    metric: '12 Initiatives',
    detail: 'Roadmap heat map with dependencies, approvals, and scorecards.'
  },
  {
    name: 'Members',
    metric: '87 Active',
    detail: 'Role-aware views for workload, PTO, and utilization in one glance.'
  },
  {
    name: 'Time Logs',
    metric: '423 hrs this week',
    detail: 'Billable vs non-billable, split by cost center, synced to invoices.'
  },
  {
    name: 'Reports',
    metric: '15 Live dashboards',
    detail: 'Velocity, story health, and exec-ready OKR snapshots streamed live.'
  }
]

const testimonials = [
  {
    name: 'Aria Winters',
    role: 'VP of Product, NovaCloud',
    quote:
      'We replaced four tools with Kanvaro. Cycle time dropped by 32% within one quarter.'
  },
  {
    name: 'Mason Reed',
    role: 'Engineering Lead, Helix Labs',
    quote: 'The clarity is incredible. Timelines, risks, and wins are crystal clear for everyone.'
  },
  {
    name: 'Leila Chen',
    role: 'Program Director, Orbit AI',
    quote: 'Finally, a project system that feels premium. Teams love the experience as much as execs.'
  }
]

export default function LandingPage() {
  const router = useRouter()
  const [ctaLoading, setCtaLoading] = useState(false)

  const handleGetStarted = async () => {
    if (ctaLoading) return
    setCtaLoading(true)
    try {
      const authResponse = await fetch('/api/auth/me')
      if (authResponse.ok) {
        router.push('/dashboard')
        return
      }

      const setupResponse = await fetch('/api/setup/status')
      const setupData = await setupResponse.json().catch(() => ({}))
      if (!setupResponse.ok || !setupData.setupCompleted) {
        router.push('/setup')
        return
      }

      router.push('/login')
    } catch (error) {
      router.push('/login')
    } finally {
      setCtaLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f6fb] text-slate-900 transition-colors dark:bg-[#040714] dark:text-white">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#f4f8ff] via-[#ffffff] to-[#e8eeff] dark:from-[#050c1d] dark:via-[#0a1030] dark:to-[#071328]" />
        <div className="absolute inset-y-0 left-1/2 w-[45rem] -translate-x-1/2 bg-[radial-gradient(circle_at_top,_rgba(120,140,255,0.25),_transparent_55%)] dark:bg-[radial-gradient(circle_at_top,_rgba(108,99,255,0.35),_transparent_55%)]" />
        <div className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 pt-8">
          <span className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500 dark:text-white/70">
            Kanvaro
          </span>
          <ThemeToggle />
        </div>
        <div className="relative mx-auto flex max-w-6xl flex-col gap-12 px-6 py-16 lg:flex-row lg:items-center lg:py-24">
          <div className="space-y-8 text-center lg:text-left">
            <p className="inline-flex items-center gap-2 rounded-full border border-slate-300/60 bg-white/70 px-4 py-1 text-xs uppercase tracking-[0.3em] text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/80">
              Workleze-inspired control room
            </p>
            <div className="space-y-6">
              <h1 className="text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl lg:text-[4rem] dark:text-white">
                The calmest way to manage <span className="text-[#7afdea]">projects, tasks</span> and time.
              </h1>
              <p className="text-lg text-slate-600 sm:text-xl dark:text-white/80">
                Kanvaro mirrors the Workleze look (without the pricing clutter) so visitors instantly
                see Tasks, Projects, Members, Time Logs, and Reports in one cinematic view.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Button
                onClick={handleGetStarted}
                disabled={ctaLoading}
                className="h-12 rounded-full bg-[#7bffde] px-8 text-slate-900 shadow-[0_20px_45px_rgba(123,255,222,0.35)] transition hover:-translate-y-1 hover:bg-[#62f5cf] disabled:opacity-70"
              >
                {ctaLoading ? (
                  <>
                    Loading Workspaces
                    <ArrowRight className="ml-2 h-4 w-4 animate-pulse" />
                  </>
                ) : (
                  <>
                    Enter the workspace
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                className="h-12 rounded-full border-slate-300 bg-white px-8 text-slate-900 hover:bg-slate-100 dark:border-white/40 dark:bg-transparent dark:text-white dark:hover:bg-white/10"
              >
                <Play className="mr-2 h-4 w-4" />
                Watch 60s tour
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {stats.map(stat => (
                <div
                  key={stat.label}
                  className="rounded-3xl border border-slate-200 bg-white/80 p-4 text-left shadow-sm dark:border-white/15 dark:bg-white/5 dark:shadow-none"
                >
                  <p className="text-[2rem] font-semibold">
                    <span
                      className="inline-flex bg-clip-text text-transparent"
                      style={{ backgroundImage: `linear-gradient(90deg, ${stat.gradient})` }}
                    >
                      {stat.value}
                    </span>
                  </p>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-white/60">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl rounded-[2.5rem] border border-slate-200 bg-white p-6 text-slate-900 shadow-[0_40px_60px_rgba(15,23,42,0.1)] backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-white dark:shadow-[0_30px_60px_rgba(0,0,0,0.35)]">
            <div className="rounded-3xl bg-white p-6 text-slate-900 shadow-inner dark:bg-[#0d1329] dark:text-white">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500 dark:text-white/60">Sprint cockpit</p>
                <span className="rounded-full bg-[#0fdbb3]/20 px-3 py-1 text-xs text-[#1c9b84] dark:bg-[#0fdbb3]/10 dark:text-[#75ffdf]">
                  Live sync
                </span>
              </div>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight">
                Aurora Dashboard Launch
              </h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-white/60">Tasks | Projects | Members</p>
              <div className="mt-6 space-y-4">
                <div>
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.4em] text-slate-400 dark:text-white/40">
                    <span>Progress</span>
                    <span>76%</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-200 dark:bg-[#1d2440]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#43ffd9] to-[#7c6fff]"
                      style={{ width: '76%' }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center text-xs font-semibold uppercase tracking-[0.3em]">
                  {['Plan', 'Design', 'Build'].map((phase, idx) => (
                    <div
                      key={phase}
                      className={`rounded-2xl border px-3 py-4 ${
                        idx <= 1
                          ? 'border-[#7bffde]/40 bg-[#e3fbf6] text-slate-900 dark:bg-[#0c1a2e] dark:text-white'
                          : 'border-slate-200 bg-white text-slate-500 dark:border-white/10 dark:bg-transparent dark:text-white/50'
                      }`}
                    >
                      {phase}
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0d152f]">
                  <p className="text-xs text-slate-500 dark:text-white/50">Next milestone</p>
                  <p className="text-base font-semibold text-slate-900 dark:text-white">Executive review & KPI sync</p>
                  <span className="text-xs text-slate-500 dark:text-white/50">4 days left</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#f7f9ff] px-6 py-20 text-slate-900 dark:bg-[#040714] dark:text-white sm:py-28">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.4em] text-[#68ffde]">
            Operating modules
          </p>
          <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
            Every Workleze-like module, shown beautifully.
          </h2>
          <p className="mt-4 text-slate-600 dark:text-white/70">
            Walk prospects through Tasks, Projects, Members, Time Logs, and Reports without hopping tabs.
            Each card feels like an interactive screenshot.
          </p>
        </div>
        <div className="mx-auto mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {modules.map(module => (
            <div
              key={module.name}
              className="group rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:border-slate-300 dark:border-white/10 dark:bg-white/5 dark:shadow-[0_25px_55px_rgba(4,7,20,0.6)]"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/5">
                  {module.icon}
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:bg-white/10 dark:text-white/70">
                  {module.badge}
                </span>
              </div>
              <h3 className="mt-5 text-xl font-semibold text-slate-900 dark:text-white">{module.name}</h3>
              <p className="mt-3 text-sm text-slate-600 dark:text-white/70">{module.description}</p>
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left text-xs uppercase tracking-[0.4em] text-slate-500 dark:border-white/10 dark:bg-[#050c1e] dark:text-white/50">
                UI preview
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-gradient-to-b from-[#eef2ff] to-[#f9fbff] px-6 py-20 dark:from-[#050c1d] dark:to-[#030714] sm:py-28">
        <div className="mx-auto max-w-6xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.4em] text-[#7bffde]">Steps</p>
          <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
            Guided journeyevery step looks like a screenshot.
          </h2>
          <p className="mt-4 text-slate-600 dark:text-white/70">
            Follow the same narrative Workleze uses: import, collaborate, and broadcast results with cinematic previews.
          </p>
        </div>
        <div className="mx-auto mt-12 grid gap-6 lg:grid-cols-3">
          {steps.map((step, idx) => (
            <div
              key={step.title}
              className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_25px_55px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/[0.03] dark:shadow-[0_35px_65px_rgba(5,7,19,0.75)]"
            >
              <p className="text-xs uppercase tracking-[0.6em] text-slate-400 dark:text-white/40">0{idx + 1}</p>
              <h3 className="mt-3 text-2xl font-semibold text-slate-900 dark:text-white">{step.title}</h3>
              <p className="mt-3 text-sm text-slate-600 dark:text-white/70">{step.description}</p>
              <div
                className="mt-6 aspect-[4/3] rounded-2xl border border-white/10 p-4"
                style={{ backgroundImage: `linear-gradient(135deg, ${step.gradient})` }}
              >
                <div className="h-full w-full rounded-xl bg-white/20 backdrop-blur">
                  <div className="flex h-full flex-col justify-between p-4 text-left">
                    <span className="text-xs uppercase tracking-[0.5em] text-white/90">{step.caption}</span>
                    <div className="space-y-2 text-sm text-white">
                      <div className="rounded-xl bg-white/15 p-3">Drag & drop roadmap builder</div>
                      <div className="rounded-xl bg-white/15 p-3">Layered board preview</div>
                      <div className="rounded-xl bg-white/15 p-3">Stakeholder snapshot</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#eef3ff] px-6 py-20 dark:bg-[#030611] sm:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.4em] text-[#8adfff]">
                Module walkthrough
              </p>
              <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
                Tasks, projects, members, timelogs, reports.
              </h2>
              <p className="mt-4 text-slate-600 dark:text-white/70">
                Each surface mirrors Workleze's card aesthetic so stakeholders understand what they're buying without extra clicks.
              </p>
            </div>
            <Button
              onClick={handleGetStarted}
              disabled={ctaLoading}
              className="h-12 rounded-full bg-slate-900 px-8 text-white hover:bg-slate-800 disabled:opacity-70 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
            >
              {ctaLoading ? 'Checking access' : 'Launch interactive preview'}
            </Button>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {showcases.map(showcase => (
              <div
                key={showcase.name}
                className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_25px_55px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-gradient-to-br dark:from-[#09132b] dark:to-[#050914] dark:shadow-[0_25px_55px_rgba(2,4,10,0.75)]"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-white">{showcase.name}</h3>
                  <span className="text-sm text-[#2bbfa1] dark:text-[#7bffde]">{showcase.metric}</span>
                </div>
                <p className="mt-3 text-sm text-slate-600 dark:text-white/70">{showcase.detail}</p>
                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left text-xs uppercase tracking-[0.4em] text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-white/40">
                  Screenshot placeholder
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-b from-[#f2f6ff] to-[#eef3ff] px-6 py-20 dark:from-[#050a1c] dark:to-[#030610] sm:py-28">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.4em] text-[#7bffde]">
            Loved by product teams
          </p>
          <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
            Stories from leaders building the future
          </h2>
        </div>
        <div className="mx-auto mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {testimonials.map(testimonial => (
            <div
              key={testimonial.name}
              className="rounded-[30px] border border-slate-200 bg-white p-6 text-left shadow-[0_20px_45px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/5 dark:shadow-[0_25px_55px_rgba(3,6,14,0.75)]"
            >
              <Quote className="h-5 w-5 text-[#2bbfa1] dark:text-[#7bffde]" />
              <p className="mt-4 text-slate-700 dark:text-white/90">{testimonial.quote}</p>
              <div className="mt-6">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{testimonial.name}</p>
                <p className="text-xs text-slate-500 dark:text-white/60">{testimonial.role}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#eef2ff] px-6 py-16 dark:bg-[#030611] sm:py-24">
        <div className="mx-auto max-w-4xl rounded-[40px] border border-slate-200 bg-gradient-to-r from-[#fefefe] via-[#f6f7fb] to-[#eef2ff] p-10 text-center shadow-[0_30px_70px_rgba(15,23,42,0.12)] dark:border-white/10 dark:bg-gradient-to-r dark:from-[#0f1329] dark:via-[#151c3d] dark:to-[#0a1f3b] dark:shadow-[0_35px_75px_rgba(3,7,17,0.85)]">
          <h2 className="text-3xl font-semibold text-slate-900 dark:text-white sm:text-4xl">
            Showcase Kanvaro like Workleze. Keep the story yours.
          </h2>
          <p className="mt-4 text-slate-600 dark:text-white/75">
            Launch the Workleze-inspired experience, invite your team, and give prospects one place to explore modules, flows, and reports.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button
              onClick={handleGetStarted}
              disabled={ctaLoading}
              className="h-12 rounded-full bg-[#7bffde] px-8 text-slate-900 hover:bg-[#68f0cf] disabled:opacity-70"
            >
              {ctaLoading ? 'Preparing' : 'Start the guided tour'}
            </Button>
            <Button
              variant="outline"
              className="h-12 rounded-full border-slate-300 px-8 text-slate-900 hover:bg-slate-100 dark:border-white/30 dark:text-white dark:hover:bg-white/10"
            >
              Chat with product design
            </Button>
          </div>
        </div>
      </section>

      <footer className="bg-white px-6 py-10 text-sm text-slate-600 dark:bg-[#02040b] dark:text-white/70">
        <div className="mx-auto flex flex-col gap-8 border-t border-slate-200 pt-8 text-center dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Kanvaro ProjectOS. All rights reserved.</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/about" className="transition hover:text-slate-900 dark:hover:text-white">
              About
            </Link>
            <Link href="/contact" className="transition hover:text-slate-900 dark:hover:text-white">
              Contact
            </Link>
            <Link href="/privacy" className="transition hover:text-slate-900 dark:hover:text-white">
              Privacy
            </Link>
            <div className="flex items-center gap-3">
              <Link href="mailto:hello@kanvaro.com" className="transition hover:text-slate-900 dark:hover:text-white">
                <Mail className="h-4 w-4" />
              </Link>
              <Link href="tel:+1800123456" className="transition hover:text-slate-900 dark:hover:text-white">
                <Phone className="h-4 w-4" />
              </Link>
              <Link href="https://www.linkedin.com" className="transition hover:text-slate-900 dark:hover:text-white">
                <Linkedin className="h-4 w-4" />
              </Link>
              <Link href="https://www.twitter.com" className="transition hover:text-slate-900 dark:hover:text-white">
                <Twitter className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}
