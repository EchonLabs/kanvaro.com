'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
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
  Twitter,
  Calendar,
  Zap,
  Shield,
  TrendingUp,
  ArrowUp
} from 'lucide-react'

const stats = [
  { label: 'Teams onboarded', value: '4,200+', gradient: '#79ffe1, #15d1ff' },
  { label: 'Time saved weekly', value: '18 hrs', gradient: '#ffa8ff, #6a5dff' },
  { label: 'Automation accuracy', value: '99.2%', gradient: '#ffd479, #ff7a7a' }
]

const modules = [
  {
    icon: <ListChecks className="h-6 w-6 text-[#7bffde]" />,
    name: 'Tasks & Agile Workspace',
    description: 'Kanban boards, backlog management, sprints, user stories, and epics. Full agile support with customizable workflows.',
    badge: 'Agile-ready',
    route: '/tasks'
  },
  {
    icon: <Layers className="h-6 w-6 text-[#a0a7ff]" />,
    name: 'Projects & Portfolio',
    description: 'Create projects with templates, manage epics, track dependencies, and visualize roadmaps with Gantt charts.',
    badge: 'Portfolio view',
    route: '/projects'
  },
  {
    icon: <Users className="h-6 w-6 text-[#ffc7ff]" />,
    name: 'Team & Permissions',
    description: 'Invite team members, assign roles, manage permissions, and control access with granular role-based security.',
    badge: 'Role-based',
    route: '/team/members'
  },
  {
    icon: <Watch className="h-6 w-6 text-[#9effff]" />,
    name: 'Time Tracking & Logs',
    description: 'Track billable hours, monitor capacity, approve time entries, and generate comprehensive time reports.',
    badge: 'Billable-ready',
    route: '/time-tracking'
  },
  {
    icon: <BarChart3 className="h-6 w-6 text-[#ffdd8f]" />,
    name: 'Reports & Analytics',
    description: 'Financial reports, team performance, project analytics, Gantt charts, and executive dashboards with real-time insights.',
    badge: 'Real-time',
    route: '/reports'
  },
  {
    icon: <Activity className="h-6 w-6 text-[#9fc5ff]" />,
    name: 'Test Management',
    description: 'Manage test suites, create test cases, plan executions, and generate comprehensive test reports for quality assurance.',
    badge: 'QA-focused',
    route: '/test-management'
  }
]

const flows = [
  {
    title: 'Project Creation Flow',
    description:
      'Start with project templates or create from scratch. Set up teams, define epics and user stories, plan sprints, and launch with full visibility.',
    caption: '1. Plan & Launch',
    gradient: '#2d2ef5, #6f55ff',
    imageKey: 'heroDashboard' as const,
    steps: ['Create Project', 'Assign Team', 'Define Epics', 'Plan Sprints', 'Launch']
  },
  {
    title: 'Task Execution Flow',
    description: 'From backlog to done: Create tasks, assign to team members, track progress on Kanban boards, manage sprints, and complete with approvals.',
    caption: '2. Execute & Track',
    gradient: '#0bbcd6, #19f2a5',
    imageKey: 'tasks' as const,
    steps: ['Backlog', 'Sprint Planning', 'In Progress', 'Review', 'Done']
  },
  {
    title: 'Time & Reporting Flow',
    description: 'Track time with timers or manual logs, get approvals, monitor capacity, generate reports, and export for invoicing and analysis.',
    caption: '3. Measure & Report',
    gradient: '#ff7ab6, #feae68',
    imageKey: 'members' as const,
    steps: ['Time Tracking', 'Approval', 'Reports', 'Analytics', 'Export']
  }
]

const showcases = [
  {
    name: 'Tasks & Backlog',
    metric: 'Multi-view',
    detail: 'Kanban boards, backlog, my tasks, user stories, and epics. Full agile workflow support with sprint planning.',
    route: '/tasks'
  },
  {
    name: 'Projects & Epics',
    metric: 'Portfolio',
    detail: 'Project templates, epic management, Gantt charts, dependencies, and comprehensive project analytics.',
    route: '/projects'
  },
  {
    name: 'Team Management',
    metric: 'Role-based',
    detail: 'Member invitations, custom roles, granular permissions, and team activity tracking with audit logs.',
    route: '/team/members'
  },
  {
    name: 'Time Tracking',
    metric: 'Billable-ready',
    detail: 'Live timer, manual logs, approval workflows, capacity monitoring, and detailed time reports with export.',
    route: '/time-tracking'
  },
  {
    name: 'Reports & Analytics',
    metric: 'Real-time',
    detail: 'Financial reports, team performance, project Gantt charts, burn-up/down, and executive dashboards.',
    route: '/reports'
  },
  {
    name: 'Test Management',
    metric: 'QA Suite',
    detail: 'Test suites, test cases, execution plans, test reports, and quality metrics for comprehensive QA workflows.',
    route: '/test-management'
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

// Cloudinary image URLs - directly set here
const LANDING_PAGE_IMAGES = {
  heroDashboard: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044927/EL-Core-Assets/Static/Kanvaro/he_1_xqkbdw.png",
  modulePreview: null,
  stepImages: {
    step1: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044928/EL-Core-Assets/Static/Kanvaro/3_1_benfd7.png",
    step2: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044928/EL-Core-Assets/Static/Kanvaro/7_a8ky5x.png",
    step3: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044929/EL-Core-Assets/Static/Kanvaro/1_qpvyfp.png"
  },
  showcaseImages: {
    tasks: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044930/EL-Core-Assets/Static/Kanvaro/2_ocdtse.png",
    projects: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044930/EL-Core-Assets/Static/Kanvaro/6_n6p2bu.png",
    members: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044929/EL-Core-Assets/Static/Kanvaro/5_1_dpjhwk.png",
    timeLogs: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044928/EL-Core-Assets/Static/Kanvaro/4_jwnslu.png",
    reports: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044929/EL-Core-Assets/Static/Kanvaro/1_qpvyfp.png"
  }
}

export default function LandingPage() {
  const router = useRouter()
  const [ctaLoading, setCtaLoading] = useState(false)
  const [showBackToTop, setShowBackToTop] = useState(false)
  
  // Use the hardcoded images directly
  const images = LANDING_PAGE_IMAGES

  useEffect(() => {
    const handleScroll = () => {
      // Show button when user scrolls down 300px
      setShowBackToTop(window.scrollY > 300)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  const handleGetStarted = async () => {
    if (ctaLoading) return
    setCtaLoading(true)
    try {
      router.push('/workspace')
    } catch (error) {
      router.push('/workspace')
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
        <div className="relative mx-auto flex max-w-7xl flex-col gap-16 px-6 pt-8 pb-20 lg:flex-row lg:items-center lg:pt-12 lg:pb-32">
          <div className="space-y-10 text-center lg:text-left lg:flex-1">
            <p className="inline-flex items-center gap-2 rounded-full border border-slate-300/60 bg-white/70 px-5 py-2 text-sm uppercase tracking-[0.3em] text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/80">
              All-in-one project management platform
            </p>
            <div className="space-y-8">
              <h1 className="text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl lg:text-[3rem] xl:text-[3.5rem] dark:text-white">
                Complete project management for <span className="text-[#7afdea]">modern teams</span> and agile workflows.
              </h1>
              <p className="text-base text-slate-600 sm:text-lg lg:text-base xl:text-lg dark:text-white/80 leading-relaxed">
                Experience the power of unified project management. Kanvaro delivers a seamless, cinematic interface where 
                Tasks, Projects, Team Members, Time Logs, and Reports converge into one intuitive workspace. 
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-center lg:justify-start">
              <Button
                onClick={handleGetStarted}
                disabled={ctaLoading}
                className="h-14 rounded-full bg-[#7bffde] px-10 text-base font-semibold text-slate-900 shadow-[0_20px_45px_rgba(123,255,222,0.35)] transition hover:-translate-y-1 hover:bg-[#62f5cf] disabled:opacity-70"
              >
                {ctaLoading ? (
                  <>
                    Loading Workspaces
                    <ArrowRight className="ml-2 h-5 w-5 animate-pulse" />
                  </>
                ) : (
                  <>
                    Enter the workspace
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                className="h-14 rounded-full border-slate-300 bg-white px-10 text-base font-semibold text-slate-900 hover:bg-slate-100 dark:border-white/40 dark:bg-transparent dark:text-white dark:hover:bg-white/10"
              >
                <Play className="mr-2 h-5 w-5" />
                Watch 60s tour
              </Button>
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
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

          <div className="relative mx-auto w-full max-w-2xl lg:max-w-3xl xl:max-w-4xl rounded-[3rem] border border-slate-200 bg-white p-8 text-slate-900 shadow-[0_50px_80px_rgba(15,23,42,0.15)] backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-white dark:shadow-[0_40px_80px_rgba(0,0,0,0.45)]">
            {images.heroDashboard ? (
              <div className="relative w-full aspect-[16/10] rounded-3xl overflow-hidden shadow-2xl border-2 border-slate-200/50 dark:border-white/10 group hover:border-[#7bffde]/50 transition-all duration-300">
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent z-10" />
                <Image
                  src={images.heroDashboard}
                  alt="Dashboard Preview"
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-700"
                  priority
                  unoptimized
                />
                <div className="absolute bottom-6 left-6 right-6 z-20">
                  <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl p-4 border border-slate-200/50 dark:border-white/10 shadow-lg">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Live Dashboard Preview</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
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
            )}
          </div>
        </div>
      </section>

      <section className="bg-[#f7f9ff] px-6 py-20 text-slate-900 dark:bg-[#040714] dark:text-white sm:py-28">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.4em] text-[#68ffde]">
            Operating modules
          </p>
          <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
            Explore all modules in one unified workspace.
          </h2>
          <p className="mt-4 text-slate-600 dark:text-white/70">
            From project planning to time tracking, from team management to comprehensive reporting. 
            Every module is designed to work seamlessly together, giving you complete visibility and control.
          </p>
        </div>
        <div className="mx-auto mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {modules.map(module => (
            <div
              key={module.name}
              className="group rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_30px_60px_rgba(15,23,42,0.12)] dark:border-white/10 dark:bg-white/5 dark:shadow-[0_25px_55px_rgba(4,7,20,0.6)] dark:hover:border-[#7bffde]/30 cursor-pointer"
              onClick={() => module.route && router.push(module.route)}
            >
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/5 group-hover:bg-[#7bffde]/10 transition-colors">
                  {module.icon}
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-white/70">
                  {module.badge}
                </span>
              </div>
              <h3 className="mt-5 text-xl font-semibold text-slate-900 dark:text-white group-hover:text-[#7bffde] transition-colors">{module.name}</h3>
              <p className="mt-3 text-sm text-slate-600 dark:text-white/70 leading-relaxed">{module.description}</p>
              <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-[#7bffde] uppercase tracking-[0.3em]">
                <span>Explore Module</span>
                <ArrowRight className="h-3 w-3" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-gradient-to-b from-[#eef2ff] to-[#f9fbff] px-6 py-20 dark:from-[#050c1d] dark:to-[#030714] sm:py-28">
        <div className="mx-auto max-w-6xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.4em] text-[#7bffde]">Key Features</p>
          <h2 className="mt-4 text-3xl font-semibold sm:text-4xl lg:text-5xl">
            Complete workflows from planning to delivery
          </h2>
          <p className="mt-4 text-lg text-slate-600 dark:text-white/70 max-w-3xl mx-auto">
            See how teams use Kanvaro: from project creation and sprint planning to time tracking and comprehensive reporting. 
            Every workflow is optimized for efficiency and visibility.
          </p>
        </div>
        <div className="mx-auto mt-12 grid gap-8 lg:grid-cols-3">
          {flows.map((step, idx) => {
            // Get the appropriate image based on imageKey
            let imageUrl: string | null = null
            if (step.imageKey === 'heroDashboard') {
              imageUrl = images.heroDashboard
            } else if (step.imageKey === 'tasks') {
              imageUrl = images.showcaseImages?.tasks || null
            } else if (step.imageKey === 'members') {
              imageUrl = images.showcaseImages?.members || null
            }

            return (
              <div
                key={step.title}
                className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-[0_25px_55px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/[0.03] dark:shadow-[0_35px_65px_rgba(5,7,19,0.75)]"
              >
                <p className="text-xs uppercase tracking-[0.6em] text-slate-400 dark:text-white/40">Flow {idx + 1}</p>
                <h3 className="mt-4 text-2xl font-semibold text-slate-900 dark:text-white">{step.title}</h3>
                <p className="mt-4 text-base text-slate-600 dark:text-white/70 leading-relaxed">{step.description}</p>
                {step.steps && (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {step.steps.map((flowStep, stepIdx) => (
                      <span
                        key={stepIdx}
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-white/10 dark:text-white/80"
                      >
                        {flowStep}
                      </span>
                    ))}
                  </div>
                )}
                {imageUrl ? (
                  <div className="mt-6 aspect-[16/10] rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 shadow-lg hover:shadow-xl transition-all duration-300 group relative">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10" />
                    <div className="absolute top-4 left-4 z-20 bg-[#7bffde]/90 backdrop-blur-sm rounded-lg px-3 py-1.5">
                      <span className="text-xs font-semibold text-slate-900">Module {idx + 1}</span>
                    </div>
                    <Image
                      src={imageUrl}
                      alt={step.title}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div
                    className="mt-6 aspect-[16/10] rounded-2xl border border-white/10 p-4"
                    style={{ backgroundImage: `linear-gradient(135deg, ${step.gradient})` }}
                  >
                    <div className="h-full w-full rounded-xl bg-white/20 backdrop-blur">
                      <div className="flex h-full flex-col justify-between p-4 text-left">
                        <span className="text-xs uppercase tracking-[0.5em] text-white/90">{step.caption}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
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
                Interactive module previews
              </h2>
              <p className="mt-4 text-slate-600 dark:text-white/70">
                Click through each module to see real interfaces. Explore tasks, projects, team management, 
                time tracking, reports, and test management in action.
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
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {showcases.map(showcase => {
              // Map showcase names to image keys
              const imageKeyMap: Record<string, keyof typeof images.showcaseImages> = {
                'Tasks & Backlog': 'tasks',
                'Projects & Epics': 'projects',
                'Team Management': 'members',
                'Time Tracking': 'timeLogs',
                'Reports & Analytics': 'reports',
                'Test Management': 'reports' // Using reports image as placeholder
              }
              const imageKey = imageKeyMap[showcase.name]
              const imageUrl = imageKey ? images.showcaseImages?.[imageKey] : null
              
              return (
                <div
                  key={showcase.name}
                  className="group rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_25px_55px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_35px_65px_rgba(15,23,42,0.15)] dark:border-white/10 dark:bg-gradient-to-br dark:from-[#09132b] dark:to-[#050914] dark:shadow-[0_25px_55px_rgba(2,4,10,0.75)] dark:hover:border-[#7bffde]/30 cursor-pointer"
                  onClick={() => showcase.route && router.push(showcase.route)}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white group-hover:text-[#7bffde] transition-colors">{showcase.name}</h3>
                    <span className="rounded-full bg-[#7bffde]/20 px-3 py-1 text-xs font-semibold text-[#2bbfa1] dark:text-[#7bffde]">{showcase.metric}</span>
                  </div>
                  <p className="mt-3 text-sm text-slate-600 dark:text-white/70 leading-relaxed">{showcase.detail}</p>
                  {imageUrl ? (
                    <div className="mt-6 relative aspect-[16/10] rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 group-hover:border-[#7bffde]/50 transition-all duration-300 shadow-lg hover:shadow-xl">
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10" />
                      <div className="absolute top-4 right-4 z-20 bg-[#7bffde]/90 backdrop-blur-sm rounded-lg px-3 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-xs font-semibold text-slate-900 flex items-center gap-1">
                          Explore <ArrowRight className="h-3 w-3" />
                        </span>
                      </div>
                      <Image
                        src={imageUrl}
                        alt={showcase.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left text-xs uppercase tracking-[0.4em] text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-white/40">
                      Module Preview
                    </div>
                  )}
                  <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-[#7bffde] uppercase tracking-[0.2em]">
                    <span>Click to explore</span>
                    <ArrowRight className="h-3 w-3" />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-b from-[#f2f6ff] to-[#eef3ff] px-6 py-20 dark:from-[#050a1c] dark:to-[#030610] sm:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold uppercase tracking-[0.4em] text-[#7bffde]">
              Comprehensive Reporting & Analytics
            </p>
            <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
              Real-time insights for data-driven decisions
            </h2>
            <p className="mt-4 text-slate-600 dark:text-white/70 max-w-3xl mx-auto">
              Generate detailed reports for financial analysis, team performance, project progress, and time tracking. 
              Export data, visualize with Gantt charts, and make informed decisions with comprehensive analytics.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              { 
                name: 'Financial Reports', 
                desc: 'Budget tracking, expenses, invoicing, and financial analytics with cost center breakdowns',
                icon: <TrendingUp className="h-5 w-5 text-[#7bffde]" />
              },
              { 
                name: 'Team Reports', 
                desc: 'Performance metrics, workload analysis, team productivity, and utilization dashboards',
                icon: <Users className="h-5 w-5 text-[#a0a7ff]" />
              },
              { 
                name: 'Project Reports', 
                desc: 'Gantt charts, progress tracking, project health dashboards, and milestone analytics',
                icon: <Layers className="h-5 w-5 text-[#ffc7ff]" />
              },
              { 
                name: 'Time Reports', 
                desc: 'Billable hours, capacity planning, utilization analytics, and time entry approvals',
                icon: <Watch className="h-5 w-5 text-[#9effff]" />
              }
            ].map((report, idx) => (
              <div
                key={report.name}
                className="group rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_15px_35px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:shadow-[0_20px_45px_rgba(15,23,42,0.12)] dark:border-white/10 dark:bg-white/5 dark:shadow-[0_20px_45px_rgba(3,6,14,0.75)]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#7bffde]/10 mb-4 group-hover:bg-[#7bffde]/20 transition-colors">
                  {report.icon}
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{report.name}</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-white/70 leading-relaxed">{report.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f7f9ff] px-6 py-20 dark:bg-[#040714] sm:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold uppercase tracking-[0.4em] text-[#7bffde]">
              Team Collaboration
            </p>
            <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
              Invite your team and collaborate seamlessly
            </h2>
            <p className="mt-4 text-slate-600 dark:text-white/70 max-w-3xl mx-auto">
              Bring your entire team together. Invite members, assign roles, manage permissions, 
              and work together on projects with real-time collaboration and activity tracking.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: <Users className="h-6 w-6 text-[#7bffde]" />,
                title: 'Team Invitations',
                description: 'Invite team members via email, assign roles, and manage access with granular permissions.'
              },
              {
                icon: <Shield className="h-6 w-6 text-[#a0a7ff]" />,
                title: 'Role-Based Access',
                description: 'Custom roles with fine-grained permissions. Control who can view, edit, or manage projects and tasks.'
              },
              {
                icon: <Activity className="h-6 w-6 text-[#ffc7ff]" />,
                title: 'Activity Tracking',
                description: 'Real-time activity feeds, notifications, and audit logs to keep everyone informed and accountable.'
              }
            ].map((feature, idx) => (
              <div
                key={feature.title}
                className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_20px_40px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/5 dark:shadow-[0_25px_55px_rgba(4,7,20,0.6)]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/5 mb-6">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">{feature.title}</h3>
                <p className="text-sm text-slate-600 dark:text-white/70 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#eef2ff] px-6 py-20 dark:bg-[#030611] sm:py-24">
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
            Ready to transform your project management?
          </h2>
          <p className="mt-4 text-slate-600 dark:text-white/75">
            Invite your team, explore all modules, experience complete workflows, and access comprehensive reports. 
            Everything you need to manage projects, track time, and deliver results all in one powerful platform.
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

      {/* Back to Top Button */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[#7bffde] text-slate-900 shadow-[0_10px_30px_rgba(123,255,222,0.4)] transition-all duration-300 hover:scale-110 hover:bg-[#62f5cf] hover:shadow-[0_15px_40px_rgba(123,255,222,0.5)] dark:bg-[#7bffde] dark:text-slate-900"
          aria-label="Back to top"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}
    </main>
  )
}
