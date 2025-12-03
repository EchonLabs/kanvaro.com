'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import { Button } from '@/components/ui/Button'
import { useTheme } from 'next-themes'
import {
  ArrowLeft,
  Zap,
  Moon,
  Sun,
  ArrowRight,
  ListChecks,
  Layers,
  Users,
  Watch,
  BarChart3,
  Activity,
  CheckCircle2,
  Play
} from 'lucide-react'

const moduleData: Record<string, {
  name: string
  tagline: string
  description: string
  icon: React.ReactNode
  iconColor: string
  iconBg: string
  submodules: { name: string; description: string }[]
  features: string[]
  image: string
  screenshots: string[]
}> = {
  'tasks': {
    name: 'Tasks & Backlog',
    tagline: 'Comprehensive Agile Task Management',
    description: 'Manage your tasks with powerful Kanban boards, backlog grooming, sprint planning, and full agile workflow support. Track user stories, epics, and tasks with customizable views and workflows.',
    icon: <ListChecks className="h-8 w-8" />,
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-50 dark:bg-emerald-900/30',
    submodules: [
      { name: 'Kanban Board', description: 'Visual task management with drag-and-drop columns and customizable workflows' },
      { name: 'Backlog', description: 'Organize and prioritize your product backlog with story points and priorities' },
      { name: 'My Tasks', description: 'Personal task view showing all assigned tasks across projects' },
      { name: 'User Stories', description: 'Create and manage user stories with acceptance criteria and linked tasks' },
      { name: 'Epics', description: 'Group related stories and track large features across sprints' },
      { name: 'Sprint Planning', description: 'Plan sprints with capacity-based planning and velocity tracking' }
    ],
    features: [
      'Drag-and-drop Kanban boards',
      'Customizable task statuses',
      'Story point estimation',
      'Task dependencies',
      'Subtasks and checklists',
      'Time tracking integration',
      'Comments and @mentions',
      'File attachments',
      'Priority levels',
      'Due dates and reminders'
    ],
    image: 'https://res.cloudinary.com/dichgutd0/image/upload/v1764044930/EL-Core-Assets/Static/Kanvaro/2_ocdtse.png',
    screenshots: [
      'https://res.cloudinary.com/dichgutd0/image/upload/v1764044930/EL-Core-Assets/Static/Kanvaro/2_ocdtse.png',
      'https://res.cloudinary.com/dichgutd0/image/upload/v1764044928/EL-Core-Assets/Static/Kanvaro/3_1_benfd7.png'
    ]
  },
  'projects': {
    name: 'Projects & Epics',
    tagline: 'Portfolio-Level Project Management',
    description: 'Create and manage projects with templates, track epics across sprints, visualize timelines with Gantt charts, and get comprehensive project analytics for informed decision-making.',
    icon: <Layers className="h-8 w-8" />,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-50 dark:bg-blue-900/30',
    submodules: [
      { name: 'Project Templates', description: 'Start quickly with pre-configured project templates' },
      { name: 'Epic Management', description: 'Track large features and initiatives across multiple sprints' },
      { name: 'Gantt Charts', description: 'Visualize project timelines and dependencies' },
      { name: 'Dependencies', description: 'Map task and epic dependencies for better planning' },
      { name: 'Project Analytics', description: 'Real-time insights into project health and progress' }
    ],
    features: [
      'Project templates',
      'Gantt chart visualization',
      'Dependency tracking',
      'Milestone tracking',
      'Project status dashboards',
      'Resource allocation',
      'Progress tracking',
      'Budget integration',
      'Team assignments',
      'Project archiving'
    ],
    image: 'https://res.cloudinary.com/dichgutd0/image/upload/v1764044930/EL-Core-Assets/Static/Kanvaro/6_n6p2bu.png',
    screenshots: [
      'https://res.cloudinary.com/dichgutd0/image/upload/v1764044930/EL-Core-Assets/Static/Kanvaro/6_n6p2bu.png'
    ]
  },
  'team': {
    name: 'Team Management',
    tagline: 'Role-Based Access Control',
    description: 'Invite team members, create custom roles with granular permissions, track team activity in real-time, and maintain comprehensive audit logs for compliance and security.',
    icon: <Users className="h-8 w-8" />,
    iconColor: 'text-purple-600',
    iconBg: 'bg-purple-50 dark:bg-purple-900/30',
    submodules: [
      { name: 'Team Members', description: 'View and manage all team members and their roles' },
      { name: 'Roles & Permissions', description: 'Create custom roles with fine-grained permission control' },
      { name: 'Invitations', description: 'Invite new team members via email with role assignment' },
      { name: 'Activity Logs', description: 'Track all team activity and changes in real-time' },
      { name: 'Audit Trail', description: 'Comprehensive audit logs for compliance and security' }
    ],
    features: [
      'Email invitations',
      'Custom role creation',
      'Granular permissions',
      'Team activity feeds',
      'Audit logging',
      'Profile management',
      'Deactivation support',
      'Bulk operations',
      'Permission inheritance',
      'Access control lists'
    ],
    image: 'https://res.cloudinary.com/dichgutd0/image/upload/v1764044929/EL-Core-Assets/Static/Kanvaro/5_1_dpjhwk.png',
    screenshots: [
      'https://res.cloudinary.com/dichgutd0/image/upload/v1764044929/EL-Core-Assets/Static/Kanvaro/5_1_dpjhwk.png'
    ]
  },
  'time-tracking': {
    name: 'Time Tracking',
    tagline: 'Billable-Ready Time Management',
    description: 'Track time with live timers or manual entries, implement approval workflows, monitor team capacity, generate detailed time reports, and export data for invoicing.',
    icon: <Watch className="h-8 w-8" />,
    iconColor: 'text-cyan-600',
    iconBg: 'bg-cyan-50 dark:bg-cyan-900/30',
    submodules: [
      { name: 'Live Timer', description: 'Start and stop timers with one click while working' },
      { name: 'Time Logs', description: 'View and edit all time entries with filtering options' },
      { name: 'Approvals', description: 'Submit and approve time entries with workflow support' },
      { name: 'Capacity Planning', description: 'Monitor team workload and availability' },
      { name: 'Time Reports', description: 'Generate detailed time reports with export options' }
    ],
    features: [
      'One-click timer',
      'Manual time entry',
      'Billable hours tracking',
      'Time approval workflow',
      'Capacity monitoring',
      'Overtime tracking',
      'Export to CSV/Excel',
      'Integration ready',
      'Multi-currency support',
      'Rate management'
    ],
    image: 'https://res.cloudinary.com/dichgutd0/image/upload/v1764044928/EL-Core-Assets/Static/Kanvaro/4_jwnslu.png',
    screenshots: [
      'https://res.cloudinary.com/dichgutd0/image/upload/v1764044928/EL-Core-Assets/Static/Kanvaro/4_jwnslu.png'
    ]
  },
  'reports': {
    name: 'Reports & Analytics',
    tagline: 'Real-Time Business Intelligence',
    description: 'Access comprehensive reports including financial analysis, team performance dashboards, project Gantt charts, burndown charts, velocity metrics, and executive-level analytics.',
    icon: <BarChart3 className="h-8 w-8" />,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-50 dark:bg-indigo-900/30',
    submodules: [
      { name: 'Financial Reports', description: 'Budget tracking, expense analysis, and revenue reports' },
      { name: 'Team Performance', description: 'Productivity metrics, workload analysis, and utilization' },
      { name: 'Gantt Charts', description: 'Visual project timelines with milestones and dependencies' },
      { name: 'Burndown Charts', description: 'Sprint and release burndown visualization' },
      { name: 'Executive Dashboard', description: 'High-level KPIs and organizational insights' }
    ],
    features: [
      'Real-time dashboards',
      'Gantt chart views',
      'Burndown/burn-up charts',
      'Velocity tracking',
      'Custom report builder',
      'Export capabilities',
      'Scheduled reports',
      'Data visualization',
      'Trend analysis',
      'Drill-down capabilities'
    ],
    image: 'https://res.cloudinary.com/dichgutd0/image/upload/v1764044929/EL-Core-Assets/Static/Kanvaro/1_qpvyfp.png',
    screenshots: [
      'https://res.cloudinary.com/dichgutd0/image/upload/v1764044929/EL-Core-Assets/Static/Kanvaro/1_qpvyfp.png'
    ]
  },
  'test-management': {
    name: 'Test Management',
    tagline: 'Comprehensive QA Suite',
    description: 'Organize test suites, create detailed test cases, plan and execute test runs, generate quality reports, and track metrics to ensure comprehensive quality assurance coverage.',
    icon: <Activity className="h-8 w-8" />,
    iconColor: 'text-rose-600',
    iconBg: 'bg-rose-50 dark:bg-rose-900/30',
    submodules: [
      { name: 'Test Suites', description: 'Organize test cases into logical suites and folders' },
      { name: 'Test Cases', description: 'Create detailed test cases with steps and expected results' },
      { name: 'Execution Plans', description: 'Plan and schedule test execution runs' },
      { name: 'Test Reports', description: 'Generate comprehensive test execution reports' },
      { name: 'Quality Metrics', description: 'Track test coverage, pass rates, and defect density' }
    ],
    features: [
      'Test suite organization',
      'Step-by-step test cases',
      'Test execution tracking',
      'Defect linking',
      'Coverage reports',
      'Pass/fail tracking',
      'Test run history',
      'Bulk operations',
      'Import/export',
      'Integration support'
    ],
    image: 'https://res.cloudinary.com/dichgutd0/image/upload/v1764044929/EL-Core-Assets/Static/Kanvaro/1_qpvyfp.png',
    screenshots: [
      'https://res.cloudinary.com/dichgutd0/image/upload/v1764044929/EL-Core-Assets/Static/Kanvaro/1_qpvyfp.png'
    ]
  }
}

export default function ModulePage() {
  const router = useRouter()
  const params = useParams()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  
  const slug = params.slug as string
  const module = moduleData[slug]

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!module) {
    return (
      <main className="min-h-screen bg-[#f4f6fb] dark:bg-[#040714] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Module Not Found</h1>
          <Button onClick={() => router.push('/landing')}>
            Return to Home
          </Button>
        </div>
      </main>
    )
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
                  theme === 'light' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900 dark:text-white/70'
                }`}
              >
                <Sun className="h-3.5 w-3.5" />
                Light
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  theme === 'dark' ? 'bg-white text-slate-900' : 'text-slate-600 hover:text-slate-900 dark:text-white/70'
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
        <div className="relative mx-auto max-w-6xl">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <div>
              <div className={`inline-flex h-16 w-16 items-center justify-center rounded-2xl ${module.iconBg} mb-6`}>
                <div className={module.iconColor}>{module.icon}</div>
              </div>
              <h1 className="text-4xl font-bold sm:text-5xl mb-4">
                {module.name}
              </h1>
              <p className="text-xl text-[#0d9488] dark:text-[#7bffde] font-medium mb-6">
                {module.tagline}
              </p>
              <p className="text-lg text-slate-600 dark:text-white/80 leading-relaxed mb-8">
                {module.description}
              </p>
              <div className="flex flex-wrap gap-4">
                <Button
                  onClick={() => router.push('/setup')}
                  className="h-12 rounded-full bg-[#0d9488] dark:bg-[#7bffde] px-8 text-white dark:text-slate-900"
                >
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push('/docs/public/concepts/features')}
                  className="h-12 rounded-full px-8"
                >
                  View Documentation
                </Button>
              </div>
            </div>
            <div className="relative aspect-[16/10] rounded-3xl overflow-hidden border border-slate-200 dark:border-white/10 shadow-2xl">
              <Image
                src={module.image}
                alt={module.name}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          </div>
        </div>
      </section>

      {/* Submodules Section */}
      <section className="px-6 py-16 bg-white dark:bg-[#0a1020]">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold text-center mb-12">Submodules</h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {module.submodules.map((sub, idx) => (
              <div
                key={sub.name}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-white/10 dark:bg-[#0f1329]"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${module.iconBg}`}>
                    <span className={`text-lg font-bold ${module.iconColor}`}>{idx + 1}</span>
                  </div>
                  <h3 className="font-bold text-lg">{sub.name}</h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-white/70">{sub.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Key Features Section */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold text-center mb-12">Key Features</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {module.features.map((feature) => (
              <div
                key={feature}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0f1329]"
              >
                <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                <span className="font-medium">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Screenshots Section */}
      <section className="px-6 py-16 bg-white dark:bg-[#0a1020]">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold text-center mb-12">Screenshots</h2>
          <div className="grid gap-6 lg:grid-cols-2">
            {module.screenshots.map((screenshot, idx) => (
              <div
                key={idx}
                className="relative aspect-[16/10] rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 shadow-lg"
              >
                <Image
                  src={screenshot}
                  alt={`${module.name} Screenshot ${idx + 1}`}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold mb-6">Ready to Get Started?</h2>
          <p className="text-lg text-slate-600 dark:text-white/80 mb-8 max-w-2xl mx-auto">
            Deploy Kanvaro on your infrastructure and start managing your projects with the {module.name} module today.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={() => router.push('/setup')}
              className="h-12 rounded-full bg-[#0d9488] dark:bg-[#7bffde] px-8 text-white dark:text-slate-900"
            >
              Start Setup
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push('/landing#module-walkthrough')}
              className="h-12 rounded-full px-8"
            >
              Explore Other Modules
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
}

