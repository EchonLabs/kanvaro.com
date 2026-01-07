'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Button } from '@/components/ui/Button'
import { useTheme } from 'next-themes'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Layers,
  ListChecks,
  Play,
  Users,
  Watch,
  Mail,
  Phone,
  Linkedin,
  Twitter,
  Zap,
  Shield,
  TrendingUp,
  ArrowUp,
  Moon,
  Sun,
  ChevronDown,
  BookOpen,
  FileText,
  MessageCircle,
  Github
} from 'lucide-react'

const modules = [
  {
    icon: <ListChecks className="h-6 w-6 text-emerald-600 dark:text-[#7bffde]" />,
    name: 'Tasks & Agile Workspace',
    description: 'Kanban boards, backlog management, sprints, user stories, and epics. Full agile support with customizable workflows.',
    badge: 'Agile-ready',
    route: '/tasks'
  },
  {
    icon: <Layers className="h-6 w-6 text-blue-600 dark:text-[#a0a7ff]" />,
    name: 'Projects & Portfolio',
    description: 'Create projects with templates, manage epics, track dependencies, and visualize roadmaps with Gantt charts.',
    badge: 'Portfolio view',
    route: '/projects'
  },
  {
    icon: <Users className="h-6 w-6 text-purple-600 dark:text-[#ffc7ff]" />,
    name: 'Team & Permissions',
    description: 'Invite team members, assign roles, manage permissions, and control access with granular role-based security.',
    badge: 'Role-based',
    route: '/team/members'
  },
  {
    icon: <Watch className="h-6 w-6 text-cyan-600 dark:text-[#9effff]" />,
    name: 'Time Tracking & Logs',
    description: 'Track billable hours, monitor capacity, approve time entries, and generate comprehensive time reports.',
    badge: 'Billable-ready',
    route: '/time-tracking'
  },
  {
    icon: <BarChart3 className="h-6 w-6 text-amber-600 dark:text-[#ffdd8f]" />,
    name: 'Reports & Analytics',
    description: 'Financial reports, team performance, project analytics, Gantt charts, and executive dashboards with real-time insights.',
    badge: 'Real-time',
    route: '/reports'
  },
  {
    icon: <Activity className="h-6 w-6 text-indigo-600 dark:text-[#9fc5ff]" />,
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
    name: 'Tasks & backlog',
    metric: 'Multi-view',
    detail: 'Comprehensive task management with Kanban boards, backlog grooming, my tasks view, user stories, and epics. Full agile workflow support with sprint planning and velocity tracking.',
    route: '/modules/tasks',
    icon: <ListChecks className="h-6 w-6" />,
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    iconBg: 'bg-emerald-50 dark:bg-emerald-900/30',
    submodules: ['Kanban Board', 'backlog', 'My Tasks', 'User Stories', 'Epics', 'Sprint Planning']
  },
  {
    name: 'Projects & Epics',
    metric: 'Portfolio',
    detail: 'Create and manage projects with customizable templates, epic management, Gantt chart visualization, dependency tracking, and comprehensive project analytics for informed decision-making.',
    route: '/modules/projects',
    icon: <Layers className="h-6 w-6" />,
    iconColor: 'text-blue-600 dark:text-blue-400',
    iconBg: 'bg-blue-50 dark:bg-blue-900/30',
    submodules: ['Project Templates', 'Epic Management', 'Gantt Charts', 'Dependencies', 'Analytics']
  },
  {
    name: 'Team Management',
    metric: 'Role-based',
    detail: 'Invite team members via email, create custom roles with granular permissions, track team activity in real-time, and maintain comprehensive audit logs for compliance and security.',
    route: '/modules/team',
    icon: <Users className="h-6 w-6" />,
    iconColor: 'text-purple-600 dark:text-purple-400',
    iconBg: 'bg-purple-50 dark:bg-purple-900/30',
    submodules: ['Team Members', 'Roles & Permissions', 'Invitations', 'Activity Logs', 'Audit Trail']
  },
  {
    name: 'Time Tracking',
    metric: 'Billable-ready',
    detail: 'Track time with live timers or manual entries, implement approval workflows, monitor team capacity, generate detailed time reports, and export data for invoicing and payroll.',
    route: '/modules/time-tracking',
    icon: <Watch className="h-6 w-6" />,
    iconColor: 'text-cyan-600 dark:text-cyan-400',
    iconBg: 'bg-cyan-50 dark:bg-cyan-900/30',
    submodules: ['Live Timer', 'Time Logs', 'Approvals', 'Capacity Planning', 'Time Reports']
  },
  {
    name: 'Reports & Analytics',
    metric: 'Real-time',
    detail: 'Access comprehensive financial reports, team performance dashboards, project Gantt charts, burn-up/down charts, velocity metrics, and executive-level analytics for strategic planning.',
    route: '/modules/reports',
    icon: <BarChart3 className="h-6 w-6" />,
    iconColor: 'text-indigo-600 dark:text-indigo-400',
    iconBg: 'bg-indigo-50 dark:bg-indigo-900/30',
    submodules: ['Financial Reports', 'Team Performance', 'Gantt Charts', 'Burndown', 'Executive Dashboard']
  },
  {
    name: 'Test Management',
    metric: 'QA Suite',
    detail: 'Organize test suites, create detailed test cases, plan and execute test runs, generate quality reports, and track metrics to ensure comprehensive quality assurance coverage.',
    route: '/modules/test-management',
    icon: <Activity className="h-6 w-6" />,
    iconColor: 'text-rose-600 dark:text-rose-400',
    iconBg: 'bg-rose-50 dark:bg-rose-900/30',
    submodules: ['Test Suites', 'Test Cases', 'Execution Plans', 'Test Reports', 'Quality Metrics']
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
  const { theme, setTheme } = useTheme()
  const [ctaLoading, setCtaLoading] = useState(false)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [showVideoModal, setShowVideoModal] = useState(false)
  const [mounted, setMounted] = useState(false)
  
  // Use the hardcoded images directly
  const images = LANDING_PAGE_IMAGES

  useEffect(() => {
    setMounted(true)
  }, [])

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
      // Interactive preview - redirect to setup page for exploration without signup
      router.push('/setup')
    } catch (error) {
      router.push('/setup')
    } finally {
      setCtaLoading(false)
    }
  }

  const startGuidedTour = () => {
    // Close video modal if open
    setShowVideoModal(false)
    
    // Scroll to first section and highlight it
    const sections = [
      'unique-features',
      'key-features',
      'workflows',
      'module-walkthrough',
      'reporting-analytics',
      'team-collaboration'
    ]
    
    let currentIndex = 0
    
    const scrollToNext = () => {
      if (currentIndex < sections.length) {
        scrollToSection(sections[currentIndex])
        currentIndex++
        if (currentIndex < sections.length) {
          setTimeout(scrollToNext, 3000) // Wait 3 seconds before next section
        }
      }
    }
    
    // Start the tour
    scrollToNext()
  }

  const scrollToSection = (sectionId: string) => {
    // Close any open dropdowns first by blurring active element
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    
    // Delay to ensure dropdown closes and DOM updates
    requestAnimationFrame(() => {
      setTimeout(() => {
        const element = document.getElementById(sectionId)
        if (element) {
          // Get the element's position and scroll with proper offset
          const headerOffset = 80
          const elementPosition = element.getBoundingClientRect().top + window.scrollY
          const offsetPosition = elementPosition - headerOffset

          // Use window.scrollTo with smooth behavior
          window.scrollTo({
            top: Math.max(0, offsetPosition),
            behavior: 'smooth'
          })
          
          // Ensure page remains scrollable after scroll completes
          setTimeout(() => {
            document.body.style.overflow = ''
            document.documentElement.style.overflow = ''
          }, 500)
        }
      }, 150) // Reduced delay for better responsiveness
    })
  }

  return (
    <main className="min-h-screen bg-[#f4f6fb] text-slate-900 transition-colors dark:bg-[#040714] dark:text-white">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#f4f8ff] via-[#ffffff] to-[#e8eeff] dark:from-[#050c1d] dark:via-[#0a1030] dark:to-[#071328]" />
        <div className="absolute inset-y-0 left-1/2 w-[45rem] -translate-x-1/2 bg-[radial-gradient(circle_at_top,_rgba(120,140,255,0.25),_transparent_55%)] dark:bg-[radial-gradient(circle_at_top,_rgba(108,99,255,0.35),_transparent_55%)]" />
        {/* Header Navigation */}
        <div className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 pt-8">
          <div className="flex items-center gap-8">
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="flex items-center gap-2 text-2xl font-bold cursor-pointer group"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#7bffde] to-[#7afdea] shadow-lg shadow-[#7bffde]/30 group-hover:shadow-[#7bffde]/50 transition-all duration-300 group-hover:scale-110">
                <Zap className="h-5 w-5 text-slate-900" />
              </div>
              <span className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 dark:from-white dark:via-[#7bffde] dark:to-white bg-clip-text text-transparent group-hover:from-[#0f766e] group-hover:via-[#14b8a6] group-hover:to-[#0f766e] dark:group-hover:from-[#7bffde] dark:group-hover:via-white dark:group-hover:to-[#7bffde] transition-all duration-300">
            Kanvaro
          </span>
            </button>
            <nav className="flex items-center gap-2 overflow-x-auto md:overflow-visible">
              {/* Features Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:text-slate-900 dark:text-white/90 dark:hover:text-white transition-all duration-200 hover:bg-slate-100 dark:hover:bg-white/10 group">
                  Features
                  <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 rounded-xl border-slate-200/80 bg-white/95 backdrop-blur-md shadow-xl dark:border-white/20 dark:bg-slate-900/95 dark:backdrop-blur-md p-2">
                  <DropdownMenuItem 
                    onSelect={() => {
                      scrollToSection('unique-features')
                    }}
                    className="rounded-lg px-3 py-2.5 cursor-pointer hover:bg-gradient-to-r hover:from-[#7bffde]/10 hover:to-[#7afdea]/10 dark:hover:from-[#7bffde]/20 dark:hover:to-[#7afdea]/20 transition-all duration-200 group"
                  >
                    <Zap className="mr-2.5 h-4 w-4 text-[#7bffde] group-hover:scale-110 transition-transform" />
                    <span className="font-medium">Unique Features</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onSelect={() => {
                      scrollToSection('key-features')
                    }}
                    className="rounded-lg px-3 py-2.5 cursor-pointer hover:bg-gradient-to-r hover:from-[#7bffde]/10 hover:to-[#7afdea]/10 dark:hover:from-[#7bffde]/20 dark:hover:to-[#7afdea]/20 transition-all duration-200 group"
                  >
                    <ListChecks className="mr-2.5 h-4 w-4 text-[#7bffde] group-hover:scale-110 transition-transform" />
                    <span className="font-medium">Key Features</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onSelect={() => {
                      scrollToSection('workflows')
                    }}
                    className="rounded-lg px-3 py-2.5 cursor-pointer hover:bg-gradient-to-r hover:from-[#7bffde]/10 hover:to-[#7afdea]/10 dark:hover:from-[#7bffde]/20 dark:hover:to-[#7afdea]/20 transition-all duration-200 group"
                  >
                    <Activity className="mr-2.5 h-4 w-4 text-[#7bffde] group-hover:scale-110 transition-transform" />
                    <span className="font-medium">Workflows</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Modules Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:text-slate-900 dark:text-white/90 dark:hover:text-white transition-all duration-200 hover:bg-slate-100 dark:hover:bg-white/10 group">
                  Modules
                  <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 rounded-xl border-slate-200/80 bg-white/95 backdrop-blur-md shadow-xl dark:border-white/20 dark:bg-slate-900/95 dark:backdrop-blur-md p-2">
                  <DropdownMenuItem 
                    onSelect={() => {
                      scrollToSection('module-walkthrough')
                    }}
                    className="rounded-lg px-3 py-2.5 cursor-pointer hover:bg-gradient-to-r hover:from-[#7bffde]/10 hover:to-[#7afdea]/10 dark:hover:from-[#7bffde]/20 dark:hover:to-[#7afdea]/20 transition-all duration-200 group"
                  >
                    <Layers className="mr-2.5 h-4 w-4 text-[#7bffde] group-hover:scale-110 transition-transform" />
                    <span className="font-medium">Module Walkthrough</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onSelect={() => {
                      scrollToSection('reporting-analytics')
                    }}
                    className="rounded-lg px-3 py-2.5 cursor-pointer hover:bg-gradient-to-r hover:from-[#7bffde]/10 hover:to-[#7afdea]/10 dark:hover:from-[#7bffde]/20 dark:hover:to-[#7afdea]/20 transition-all duration-200 group"
                  >
                    <BarChart3 className="mr-2.5 h-4 w-4 text-[#7bffde] group-hover:scale-110 transition-transform" />
                    <span className="font-medium">Reports & Analytics</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onSelect={() => {
                      scrollToSection('team-collaboration')
                    }}
                    className="rounded-lg px-3 py-2.5 cursor-pointer hover:bg-gradient-to-r hover:from-[#7bffde]/10 hover:to-[#7afdea]/10 dark:hover:from-[#7bffde]/20 dark:hover:to-[#7afdea]/20 transition-all duration-200 group"
                  >
                    <Users className="mr-2.5 h-4 w-4 text-[#7bffde] group-hover:scale-110 transition-transform" />
                    <span className="font-medium">Team Collaboration</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Demo Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:text-slate-900 dark:text-white/90 dark:hover:text-white transition-all duration-200 hover:bg-slate-100 dark:hover:bg-white/10 group">
                  Demo
                  <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 rounded-xl border-slate-200/80 bg-white/95 backdrop-blur-md shadow-xl dark:border-white/20 dark:bg-slate-900/95 dark:backdrop-blur-md p-2">
                  <DropdownMenuItem 
                    onClick={() => setShowVideoModal(true)}
                    className="rounded-lg px-3 py-2.5 cursor-pointer hover:bg-gradient-to-r hover:from-[#7bffde]/10 hover:to-[#7afdea]/10 dark:hover:from-[#7bffde]/20 dark:hover:to-[#7afdea]/20 transition-all duration-200 group"
                  >
                    <Play className="mr-2.5 h-4 w-4 text-[#7bffde] group-hover:scale-110 transition-transform" />
                    <span className="font-medium">Guided Tour</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={handleGetStarted}
                    className="rounded-lg px-3 py-2.5 cursor-pointer hover:bg-gradient-to-r hover:from-[#7bffde]/10 hover:to-[#7afdea]/10 dark:hover:from-[#7bffde]/20 dark:hover:to-[#7afdea]/20 transition-all duration-200 group"
                  >
                    <Zap className="mr-2.5 h-4 w-4 text-[#7bffde] group-hover:scale-110 transition-transform" />
                    <span className="font-medium">Interactive Preview</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Documentation Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:text-slate-900 dark:text-white/90 dark:hover:text-white transition-all duration-200 hover:bg-slate-100 dark:hover:bg-white/10 group">
                  Documentation
                  <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 rounded-xl border-slate-200/80 bg-white/95 backdrop-blur-md shadow-xl dark:border-white/20 dark:bg-slate-900/95 dark:backdrop-blur-md p-2">
                  <DropdownMenuItem 
                    onClick={() => window.open('/docs/public/self-hosting/docker-deployment', '_blank')}
                    className="rounded-lg px-3 py-2.5 cursor-pointer hover:bg-gradient-to-r hover:from-[#7bffde]/10 hover:to-[#7afdea]/10 dark:hover:from-[#7bffde]/20 dark:hover:to-[#7afdea]/20 transition-all duration-200 group"
                  >
                    <FileText className="mr-2.5 h-4 w-4 text-[#7bffde] group-hover:scale-110 transition-transform" />
                    <span className="font-medium">Installation</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => window.open('/docs/public/concepts/features', '_blank')}
                    className="rounded-lg px-3 py-2.5 cursor-pointer hover:bg-gradient-to-r hover:from-[#7bffde]/10 hover:to-[#7afdea]/10 dark:hover:from-[#7bffde]/20 dark:hover:to-[#7afdea]/20 transition-all duration-200 group"
                  >
                    <BookOpen className="mr-2.5 h-4 w-4 text-[#7bffde] group-hover:scale-110 transition-transform" />
                    <span className="font-medium">User Guide</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Theme Toggle - Horizontal */}
            {mounted && (
              <div className="hidden sm:flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-1 dark:border-white/20 dark:bg-white/5">
                <button
                  onClick={() => setTheme('light')}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    theme === 'light'
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'text-slate-600 hover:text-slate-900 dark:text-white/70 dark:hover:text-white'
                  }`}
                >
                  <Sun className="h-3.5 w-3.5" />
                  Light
                </button>
                <button
                  onClick={() => setTheme('dark')}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    theme === 'dark'
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'text-slate-600 hover:text-slate-900 dark:text-white/70 dark:hover:text-white'
                  }`}
                >
                  <Moon className="h-3.5 w-3.5" />
                  Dark
                </button>
              </div>
            )}
            
            {/* Right-side CTAs */}
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={() => router.push('/login')}
                className="hidden sm:flex text-sm font-medium hover:bg-slate-100 dark:hover:bg-[#7bffde]/20 dark:hover:text-[#7bffde]"
              >
                Login
              </Button>
            </div>
          </div>
        </div>
        <div className="relative mx-auto flex max-w-7xl flex-col gap-16 px-6 pt-20 pb-20 lg:flex-row lg:items-center lg:pt-24 lg:pb-32">
          <div className="space-y-10 text-center lg:text-left lg:flex-1">
            <p className="inline-flex items-center gap-2 rounded-full border border-slate-300/60 bg-white/70 px-5 py-2 text-sm uppercase tracking-[0.3em] text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/80">
              <Zap className="h-4 w-4 text-[#0d9488] dark:text-[#7bffde]" />
              All-in-One Project Management Platform
            </p>
            <div className="space-y-8">
              <h1 className="text-2xl font-bold leading-tight text-slate-900 sm:text-3xl lg:text-[2.5rem] xl:text-[3rem] dark:text-white">
                <span className="block">Build, Track &</span>
                <span className="block mt-1 sm:mt-2 lg:mt-3 xl:mt-4">Deliver With</span>
                <span className="block mt-1 sm:mt-2 lg:mt-3 xl:mt-4 bg-gradient-to-r from-[#0d9488] to-[#14b8a6] dark:from-[#7bffde] dark:to-[#7afdea] bg-clip-text text-transparent">Confidence</span>
              </h1>
              <p className="text-base text-slate-600 sm:text-lg lg:text-base xl:text-lg dark:text-white/80 leading-relaxed">
                The complete project management solution for modern teams. Agile workflows, time tracking, financial management, and powerful analytics — all in one beautifully designed workspace.
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-center lg:justify-start">
              <Button
                onClick={() => router.push('/setup')}
                disabled={ctaLoading}
                className="h-14 rounded-full bg-[#0d9488] dark:bg-[#7bffde] px-10 text-base font-semibold text-white dark:text-slate-900 shadow-[0_20px_45px_rgba(13,148,136,0.35)] dark:shadow-[0_20px_45px_rgba(123,255,222,0.35)] transition hover:-translate-y-1 hover:bg-[#0f766e] dark:hover:bg-[#62f5cf] disabled:opacity-70"
              >
                {ctaLoading ? (
                  <>
                    Loading...
                    <ArrowRight className="ml-2 h-5 w-5 animate-pulse" />
                  </>
                ) : (
                  <>
                    Get Started
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowVideoModal(true)}
                className="h-14 rounded-full border-slate-300 bg-white px-10 text-base font-semibold text-slate-900 hover:bg-slate-100 dark:border-white/40 dark:bg-transparent dark:text-white dark:hover:bg-white/10"
              >
                <Play className="mr-2 h-5 w-5" />
                Watch 60s Tour
              </Button>
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

      {/* Unique Features Section */}
      <section id="unique-features" className="bg-[#f7f9ff] px-6 py-20 text-slate-900 dark:bg-[#040714] dark:text-white sm:py-28">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.4em] text-[#0d9488] dark:text-[#68ffde]">
            Unique Features
          </p>
          <h2 className="mt-4 text-4xl font-semibold sm:text-5xl">
            What makes Kanvaro different
          </h2>
          <p className="mt-4 text-slate-600 dark:text-white/80">
            Built for teams who want complete control, flexibility, and ownership of their project management solution.
          </p>
        </div>
        <div className="mx-auto mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              title: 'Self-Hosted',
              description: 'Complete control over your data with Docker-based deployment. Host on your own infrastructure with full data sovereignty. No third-party access, complete privacy, and compliance with your organization\'s security policies.',
              icon: <Shield className="h-6 w-6 text-[#0d9488] dark:text-[#7bffde]" />,
              color: 'from-[#0d9488]/10 to-[#0d9488]/5 dark:from-[#7bffde]/10 dark:to-[#7bffde]/5'
            },
            {
              title: 'Open Source',
              description: 'Fully open-source with community-driven development. Customize and extend to fit your needs. Any organization can configure the system and create their admin account as the first step to get started.',
              icon: <Zap className="h-6 w-6 text-[#6366f1]" />,
              color: 'from-[#6366f1]/10 to-[#6366f1]/5'
            },
            {
              title: 'Modern Stack',
              description: 'Built with Next.js, Node.js, and MongoDB for a fast, scalable, and modern experience. Enjoy real-time updates, server-side rendering, and a responsive UI that works seamlessly across all devices.',
              icon: <Activity className="h-6 w-6 text-[#d946ef]" />,
              color: 'from-[#d946ef]/10 to-[#d946ef]/5'
            },
            {
              title: 'Scalable',
              description: 'Designed to grow with your team and project complexity from startups to enterprises. Handle thousands of tasks, multiple projects, and large teams without performance degradation.',
              icon: <TrendingUp className="h-6 w-6 text-[#06b6d4]" />,
              color: 'from-[#06b6d4]/10 to-[#06b6d4]/5'
            },
            {
              title: 'Customizable',
              description: 'Flexible architecture for custom workflows, integrations, and branding. Adapt the system to match your existing processes, create custom fields, and integrate with your favorite tools.',
              icon: <Layers className="h-6 w-6 text-[#f59e0b]" />,
              color: 'from-[#f59e0b]/10 to-[#f59e0b]/5'
            }
          ].map((feature, idx) => (
            <div
              key={feature.title}
              className="group relative rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-2 hover:border-[#7bffde]/30 hover:shadow-[0_12px_40px_rgba(123,255,222,0.15)] dark:border-white/20 dark:bg-gradient-to-br dark:from-[#0f1329] dark:via-[#151c3d] dark:to-[#0a1f3b] dark:shadow-[0_4px_20px_rgba(0,0,0,0.5)] dark:hover:border-[#7bffde]/40"
            >
              <div className={`absolute inset-0 rounded-[24px] bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-100 transition-opacity duration-300 dark:opacity-20`} />
              <div className="relative z-10">
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${feature.color} mb-5 group-hover:scale-110 transition-transform duration-300`}>
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3 group-hover:text-[#0d9488] dark:group-hover:text-[#7bffde] transition-colors">{feature.title}</h3>
                <p className="text-sm text-slate-600 dark:text-white/80 leading-relaxed">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Key Features Section */}
      <section id="key-features" className="bg-gradient-to-b from-[#eef2ff] to-[#f9fbff] px-6 py-20 dark:from-[#050c1d] dark:to-[#030714] sm:py-28">
        <div className="mx-auto max-w-6xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.4em] text-[#0d9488] dark:text-[#7bffde]">Key Features</p>
          <h2 className="mt-4 text-4xl font-semibold sm:text-5xl lg:text-6xl">
            Core Project Management Features
          </h2>
          <p className="mt-4 text-lg text-slate-600 dark:text-white/70 max-w-3xl mx-auto">
            Everything you need to manage projects, teams, and workflows in one unified platform.
          </p>
        </div>
        <div className="mx-auto mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[
            { 
              name: 'Project Creation & Management', 
              description: 'Create projects with templates, manage hierarchies, track lifecycles, and visualize timelines.',
              icon: <Layers className="h-6 w-6" />,
              iconColor: 'text-blue-600 dark:text-blue-400',
              iconBg: 'bg-blue-50 dark:bg-blue-900/30',
              features: ['Project Templates', 'Hierarchical Structure', 'Status Tracking', 'Visual Timeline']
            },
            { 
              name: 'Task Management with Scrum & Kanban', 
              description: 'Full Scrum & Kanban support with sprint planning, backlog management, and velocity tracking.',
              icon: <ListChecks className="h-6 w-6" />,
              iconColor: 'text-emerald-600 dark:text-emerald-400',
              iconBg: 'bg-emerald-50 dark:bg-emerald-900/30',
              features: ['Kanban Boards', 'Sprint Planning', 'Burndown Charts', 'Velocity Metrics']
            },
            { 
              name: 'Team Collaboration & User Management', 
              description: 'Invite members, assign roles, manage permissions, and collaborate with real-time activity feeds.',
              icon: <Users className="h-6 w-6" />,
              iconColor: 'text-purple-600 dark:text-purple-400',
              iconBg: 'bg-purple-50 dark:bg-purple-900/30',
              features: ['Role-Based Access', 'Team Invitations', 'Activity Tracking', 'Audit Logs']
            },
            { 
              name: 'Invoicing & Billing Capabilities', 
              description: 'Generate professional invoices, track payments, manage billing cycles, and automate financial workflows.',
              icon: <FileText className="h-6 w-6" />,
              iconColor: 'text-rose-600 dark:text-rose-400',
              iconBg: 'bg-rose-50 dark:bg-rose-900/30',
              features: ['Invoice Generation', 'Payment Tracking', 'Billing Automation', 'Financial Reports']
            },
            { 
              name: 'File Management & Document Sharing', 
              description: 'Upload, organize, and share files securely. Attach documents to tasks, projects, and collaborate in real-time.',
              icon: <Layers className="h-6 w-6" />,
              iconColor: 'text-amber-600 dark:text-amber-400',
              iconBg: 'bg-amber-50 dark:bg-amber-900/30',
              features: ['File Uploads', 'Document Sharing', 'Version Control', 'Secure Storage']
            },
            { 
              name: 'Time Tracking & Reporting', 
              description: 'Track billable hours with built-in timers, approval workflows, and comprehensive time reports.',
              icon: <Watch className="h-6 w-6" />,
              iconColor: 'text-cyan-600 dark:text-cyan-400',
              iconBg: 'bg-cyan-50 dark:bg-cyan-900/30',
              features: ['Live Timer', 'Billable Hours', 'Time Approval', 'Capacity Planning']
            },
            { 
              name: 'Budget Allocation & Financial Management', 
              description: 'Budget allocation, expense tracking, invoicing, and ROI analytics with multi-currency support.',
              icon: <TrendingUp className="h-6 w-6" />,
              iconColor: 'text-orange-600 dark:text-orange-400',
              iconBg: 'bg-orange-50 dark:bg-orange-900/30',
              features: ['Budget Tracking', 'Cost Centers', 'Expense Management', 'ROI Analytics']
            },
            { 
              name: 'Reports & Analytics', 
              description: 'Real-time dashboards, Gantt charts, team performance metrics, and exportable custom reports.',
              icon: <BarChart3 className="h-6 w-6" />,
              iconColor: 'text-indigo-600 dark:text-indigo-400',
              iconBg: 'bg-indigo-50 dark:bg-indigo-900/30',
              features: ['Executive Dashboards', 'Gantt Charts', 'Custom Reports', 'Data Export']
            }
          ].map((feature, idx) => (
            <div
              key={feature.name}
              className="group relative overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/90 backdrop-blur-sm p-6 shadow-[0_2px_12px_rgba(15,23,42,0.04)] transition-all duration-300 hover:-translate-y-2 hover:border-[#7bffde]/50 hover:bg-white hover:shadow-[0_8px_32px_rgba(123,255,222,0.15)] dark:border-white/20 dark:bg-gradient-to-br dark:from-[#0f1329] dark:via-[#151c3d] dark:to-[#0a1f3b] dark:backdrop-blur-sm dark:shadow-[0_2px_12px_rgba(0,0,0,0.3)] dark:hover:border-[#7bffde]/50 dark:hover:shadow-[0_8px_32px_rgba(123,255,222,0.2)]"
            >
              <div className={`absolute top-0 right-0 w-32 h-32 rounded-full ${feature.iconBg} opacity-20 blur-2xl group-hover:opacity-30 transition-opacity duration-300`} />
              <div className="relative z-10">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${feature.iconBg} mb-4 group-hover:scale-110 transition-transform duration-300 shadow-md`}>
                  <div className={feature.iconColor}>
                    {feature.icon}
                  </div>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 group-hover:text-[#0d9488] dark:group-hover:text-[#7bffde] transition-colors">{feature.name}</h3>
                <p className="text-sm text-slate-600 dark:text-white/80 mb-4 leading-relaxed">{feature.description}</p>
                <div className="flex flex-wrap gap-2">
                  {feature.features.map((feat, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 dark:bg-slate-700/70 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-white/10"
                    >
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">✓</span>
                      {feat}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Workflows Section */}
      <section id="workflows" className="bg-gradient-to-b from-[#f9fbff] to-[#eef2ff] px-6 py-20 dark:from-[#030714] dark:to-[#050c1d] sm:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold uppercase tracking-[0.4em] text-[#0d9488] dark:text-[#7bffde]">Workflows</p>
            <h2 className="mt-4 text-4xl font-semibold sm:text-5xl lg:text-6xl">
              Streamlined Project Workflows
            </h2>
            <p className="mt-4 text-lg text-slate-600 dark:text-white/70 max-w-3xl mx-auto">
              Visualize your project flow from start to finish with our intuitive workflow system.
            </p>
          </div>
          <div className="mx-auto grid gap-8 lg:grid-cols-3">
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
                className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-[0_25px_55px_rgba(15,23,42,0.08)] dark:border-white/20 dark:bg-gradient-to-br dark:from-[#0f1329] dark:via-[#151c3d] dark:to-[#0a1f3b] dark:shadow-[0_35px_65px_rgba(0,0,0,0.6)]"
              >
                <p className="text-xs uppercase tracking-[0.6em] text-slate-400 dark:text-white/60">Flow {idx + 1}</p>
                <h3 className="mt-4 text-2xl font-semibold text-slate-900 dark:text-white">{step.title}</h3>
                <p className="mt-4 text-base text-slate-600 dark:text-white/80 leading-relaxed">{step.description}</p>
                {step.steps && (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {step.steps.map((flowStep, stepIdx) => (
                      <span
                        key={stepIdx}
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-white/20 dark:text-white/90"
                      >
                        {flowStep}
                      </span>
                    ))}
                  </div>
                )}
                {imageUrl ? (
                  <div className="mt-6 aspect-[16/10] rounded-2xl overflow-hidden border border-slate-200 dark:border-white/20 shadow-lg hover:shadow-xl transition-all duration-300 group relative">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10" />
                    <div className="absolute top-4 left-4 z-20 bg-[#7bffde]/90 dark:bg-[#7bffde]/80 backdrop-blur-sm rounded-lg px-3 py-1.5">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-900">Module {idx + 1}</span>
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
        </div>
      </section>

      {/* Module Walkthrough Section */}
      <section id="module-walkthrough" className="bg-[#eef3ff] px-6 py-20 dark:bg-[#030611] sm:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold uppercase tracking-[0.4em] text-[#0d9488] dark:text-[#8adfff]">
              Module Walkthrough
            </p>
            <h2 className="mt-3 text-4xl font-semibold sm:text-5xl">
              Explore all system modules
            </h2>
            <p className="mt-4 text-slate-600 dark:text-white/80 max-w-3xl mx-auto">
              Discover each module's capabilities, submodules, and features. Click any module to explore detailed information, screenshots, and workflows.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {showcases.map(showcase => {
              // Map showcase names to image keys
              const imageKeyMap: Record<string, keyof typeof images.showcaseImages> = {
                'Tasks & backlog': 'tasks',
                'Projects & Epics': 'projects',
                'Team Management': 'members',
                'Time Tracking': 'timeLogs',
                'Reports & Analytics': 'reports',
                'Test Management': 'reports'
              }
              const imageKey = imageKeyMap[showcase.name]
              const imageUrl = imageKey ? images.showcaseImages?.[imageKey] : null
              
              return (
                <div
                  key={showcase.name}
                  className="group rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_25px_55px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_35px_65px_rgba(15,23,42,0.15)] dark:border-white/20 dark:bg-gradient-to-br dark:from-[#0f1329] dark:via-[#151c3d] dark:to-[#0a1f3b] dark:shadow-[0_25px_55px_rgba(0,0,0,0.6)] dark:hover:border-[#7bffde]/40 cursor-pointer"
                  onClick={() => showcase.route && router.push(showcase.route)}
                >
                  {/* Module Header with Icon */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${showcase.iconBg} shadow-md group-hover:scale-110 transition-transform duration-300`}>
                      <div className={showcase.iconColor}>
                        {showcase.icon}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-xl font-semibold text-slate-900 dark:text-white group-hover:text-[#0d9488] dark:group-hover:text-[#7bffde] transition-colors">{showcase.name}</h3>
                        <span className="rounded-full bg-[#0d9488]/10 dark:bg-[#7bffde]/20 px-3 py-1 text-xs font-semibold text-[#0d9488] dark:text-[#7bffde]">{showcase.metric}</span>
                      </div>
                    </div>
                  </div>

                  {/* Module Description */}
                  <p className="text-sm text-slate-600 dark:text-white/80 leading-relaxed mb-4">{showcase.detail}</p>

                  {/* Submodules */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {showcase.submodules.map((submodule, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-white/80"
                      >
                        {submodule}
                      </span>
                    ))}
                  </div>

                  {/* Module Preview Image */}
                  {imageUrl ? (
                    <div className="relative aspect-[16/10] rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 group-hover:border-[#0d9488]/50 dark:group-hover:border-[#7bffde]/50 transition-all duration-300 shadow-lg hover:shadow-xl">
                      <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10" />
                      <Image
                        src={imageUrl}
                        alt={showcase.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left text-xs uppercase tracking-[0.4em] text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-white/40">
                      Module Preview
                    </div>
                  )}

                  {/* Click to Explore CTA */}
                  <div className="mt-6 pt-4 border-t border-slate-200 dark:border-white/10">
                    <button className="w-full flex items-center justify-center gap-2 rounded-full bg-[#0d9488]/10 dark:bg-[#7bffde]/20 py-3 text-sm font-semibold text-[#0d9488] dark:text-[#7bffde] hover:bg-[#0d9488] hover:text-white dark:hover:bg-[#7bffde] dark:hover:text-slate-900 transition-colors">
                      <span>Click to Explore</span>
                      <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section id="reporting-analytics" className="bg-gradient-to-b from-[#f2f6ff] to-[#eef3ff] px-6 py-20 dark:from-[#050a1c] dark:to-[#030610] sm:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold uppercase tracking-[0.4em] text-[#0d9488] dark:text-[#7bffde]">
              Comprehensive Reporting & Analytics
            </p>
            <h2 className="mt-4 text-4xl font-semibold sm:text-5xl">
              Real-time insights for data-driven decisions
            </h2>
            <p className="mt-4 text-slate-600 dark:text-white/80 max-w-3xl mx-auto">
              Generate detailed reports for financial analysis, team performance, project progress, and time tracking. 
              Export data, visualize with Gantt charts, and make informed decisions with comprehensive analytics.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              { 
                name: 'Financial Reports', 
                desc: 'Budget tracking, expenses, invoicing, and financial analytics with cost center breakdowns',
                icon: <TrendingUp className="h-5 w-5 text-[#0d9488] dark:text-[#7bffde]" />
              },
              { 
                name: 'Team Reports', 
                desc: 'Performance metrics, workload analysis, team productivity, and utilization dashboards',
                icon: <Users className="h-5 w-5 text-[#6366f1]" />
              },
              { 
                name: 'Project Reports', 
                desc: 'Gantt charts, progress tracking, project health dashboards, and milestone analytics',
                icon: <Layers className="h-5 w-5 text-[#d946ef]" />
              },
              { 
                name: 'Time Reports', 
                desc: 'Billable hours, capacity planning, utilization analytics, and time entry approvals',
                icon: <Watch className="h-5 w-5 text-[#06b6d4]" />
              }
            ].map((report, idx) => (
              <div
                key={report.name}
                className="group rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_15px_35px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:shadow-[0_20px_45px_rgba(15,23,42,0.12)] dark:border-white/20 dark:bg-gradient-to-br dark:from-[#0f1329] dark:via-[#151c3d] dark:to-[#0a1f3b] dark:shadow-[0_20px_45px_rgba(0,0,0,0.6)]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0d9488]/10 dark:bg-[#7bffde]/20 mb-4 group-hover:bg-[#0d9488]/20 dark:group-hover:bg-[#7bffde]/30 transition-colors">
                  {report.icon}
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{report.name}</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-white/80 leading-relaxed">{report.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="team-collaboration" className="bg-[#f7f9ff] px-6 py-20 dark:bg-[#040714] sm:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold uppercase tracking-[0.4em] text-[#0d9488] dark:text-[#7bffde]">
              Team Collaboration
            </p>
            <h2 className="mt-4 text-4xl font-semibold sm:text-5xl">
              Invite your team and collaborate seamlessly
            </h2>
            <p className="mt-4 text-slate-600 dark:text-white/80 max-w-3xl mx-auto">
              Bring your entire team together. Invite members, assign roles, manage permissions, 
              and work together on projects with real-time collaboration and activity tracking.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: <Users className="h-6 w-6 text-[#0d9488] dark:text-[#7bffde]" />,
                title: 'Team Invitations',
                description: 'Invite team members via email, assign roles, and manage access with granular permissions.'
              },
              {
                icon: <Shield className="h-6 w-6 text-[#6366f1]" />,
                title: 'Role-Based Access',
                description: 'Custom roles with fine-grained permissions. Control who can view, edit, or manage projects and tasks.'
              },
              {
                icon: <Activity className="h-6 w-6 text-[#d946ef]" />,
                title: 'Activity Tracking',
                description: 'Real-time activity feeds, notifications, and audit logs to keep everyone informed and accountable.'
              }
            ].map((feature, idx) => (
              <div
                key={feature.title}
                className="group rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_20px_40px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_30px_60px_rgba(15,23,42,0.15)] hover:border-[#7bffde]/30 dark:border-white/20 dark:bg-gradient-to-br dark:from-[#0f1329] dark:via-[#151c3d] dark:to-[#0a1f3b] dark:shadow-[0_25px_55px_rgba(0,0,0,0.6)] dark:hover:border-[#7bffde]/40 dark:hover:shadow-[0_35px_65px_rgba(123,255,222,0.2)]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/10 mb-6">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">{feature.title}</h3>
                <p className="text-sm text-slate-600 dark:text-white/80 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="get-started" className="bg-gradient-to-b from-[#eef2ff] to-[#f4f6fb] px-6 py-20 dark:from-[#030611] dark:to-[#040714] sm:py-28">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-[40px] border border-slate-200 bg-gradient-to-br from-white via-[#f6f7fb] to-[#eef2ff] p-12 text-center shadow-[0_30px_70px_rgba(15,23,42,0.12)] dark:border-white/10 dark:bg-gradient-to-br dark:from-[#0f1329] dark:via-[#151c3d] dark:to-[#0a1f3b] dark:shadow-[0_35px_75px_rgba(3,7,17,0.85)]">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#0d9488]/10 dark:bg-[#7bffde]/20 px-4 py-2 mb-6">
              <Zap className="h-4 w-4 text-[#0d9488] dark:text-[#7bffde]" />
              <span className="text-sm font-semibold text-[#0d9488] dark:text-[#7bffde]">Get Started Today</span>
        </div>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl lg:text-5xl">
            Ready to transform your project management?
          </h2>
            <p className="mt-6 text-lg text-slate-600 dark:text-white/90 max-w-2xl mx-auto leading-relaxed">
              Explore Kanvaro without signing up. Take a guided tour to discover all features, or chat with our team for personalized assistance.
          </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Button
                onClick={startGuidedTour}
              disabled={ctaLoading}
                className="h-14 rounded-full bg-[#0d9488] dark:bg-[#7bffde] px-10 text-base font-bold text-white dark:text-slate-900 shadow-[0_20px_45px_rgba(13,148,136,0.35)] dark:shadow-[0_20px_45px_rgba(123,255,222,0.35)] hover:bg-[#0f766e] dark:hover:bg-[#68f0cf] hover:shadow-[0_25px_55px_rgba(13,148,136,0.45)] dark:hover:shadow-[0_25px_55px_rgba(123,255,222,0.45)] disabled:opacity-70 transition-all"
            >
                <Play className="mr-2 h-5 w-5" />
                Start the Guided Tour
            </Button>
            <Button
              variant="outline"
                onClick={() => {
                  // Open chat widget or contact form
                  // For now, opening contact page - can be replaced with chat widget integration
                  router.push('/contact')
                }}
                className="h-14 rounded-full border-2 border-slate-300 bg-white px-10 text-base font-semibold text-slate-900 hover:bg-slate-50 dark:border-white/40 dark:bg-transparent dark:text-white dark:hover:bg-white/20"
            >
                <MessageCircle className="mr-2 h-5 w-5" />
                Chat with the Team
            </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500 dark:text-white/70">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                <span>No signup required to explore</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                <span>Open source & self-hosted</span>
              </div>
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4" />
                <span>Full control over your data</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-[#02040b] px-4 sm:px-6 py-12 sm:py-16 text-sm text-white/80 dark:bg-[#010208]">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8 sm:gap-6 lg:gap-8 mb-8 sm:mb-12">
            {/* Company Info */}
            <div className="sm:col-span-2 lg:col-span-2 lg:pl-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#7bffde] to-[#7afdea] shadow-lg shadow-[#7bffde]/30">
                  <Zap className="h-5 w-5 text-slate-900" />
                </div>
                <span className="text-xl font-bold text-white">Kanvaro</span>
              </div>
              <p className="text-sm text-white/70 leading-relaxed max-w-md">
                The complete open-source project management platform for modern teams. Self-hosted, customizable, and built for agile workflows, time tracking, and financial management. Deploy on your infrastructure with full data control.
              </p>
            </div>

            {/* Company Column */}
            <div className="mt-6 sm:mt-0">
              <h3 className="font-semibold text-white mb-4 text-base">Company</h3>
              <ul className="space-y-3">
                <li>
                  <Link href="/about" className="text-white/70 hover:text-[#7bffde] transition-colors text-sm">
                    About
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="text-white/70 hover:text-[#7bffde] transition-colors text-sm">
                    Contact
                  </Link>
                </li>
              </ul>
            </div>

            {/* Product Column */}
            <div className="mt-6 sm:mt-0">
              <h3 className="font-semibold text-white mb-4 text-base">Product</h3>
              <ul className="space-y-3">
                <li>
                  <Link href="/roadmap" className="text-white/70 hover:text-[#7bffde] transition-colors text-sm">
                    Roadmap
                  </Link>
                </li>
                <li>
                  <Link href="/feedback" className="text-white/70 hover:text-[#7bffde] transition-colors text-sm">
                    Feedback
                  </Link>
                </li>
              </ul>
            </div>

            {/* Resources Column */}
            <div className="mt-6 sm:mt-0">
              <h3 className="font-semibold text-white mb-4 text-base">Resources</h3>
              <ul className="space-y-3">
                <li>
                  <Link href="/blog" className="text-white/70 hover:text-[#7bffde] transition-colors text-sm">
                    Blogs
                  </Link>
                </li>
                <li>
                  <Link href="https://docs.kanvaro.com" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-[#7bffde] transition-colors text-sm">
                    User Guide
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Section */}
          <div className="border-t border-white/10 pt-6 sm:pt-8 flex flex-col items-center gap-4">
            <p className="text-white/60 text-xs text-center px-4">
              © {new Date().getFullYear()} Kanvaro. All rights reserved.
            </p>
            <div className="flex items-center gap-3 sm:gap-4 flex-wrap justify-center">
              <Link 
                href="https://github.com/EchonLabs/kanvaro.com" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-white/70 hover:text-[#7bffde] transition-colors"
                aria-label="GitHub"
              >
                <Github className="h-5 w-5" />
              </Link>
              <Link 
                href="https://x.com/kanvaro" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-white/70 hover:text-[#7bffde] transition-colors"
                aria-label="Twitter/X"
              >
                <Twitter className="h-5 w-5" />
              </Link>
              <Link 
                href="https://www.linkedin.com/company/kanvaro" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-white/70 hover:text-[#7bffde] transition-colors"
                aria-label="LinkedIn"
              >
                <Linkedin className="h-5 w-5" />
              </Link>
              <Link 
                href="mailto:kanvaro@echonlabs.com" 
                className="text-white/70 hover:text-[#7bffde] transition-colors"
                aria-label="Email"
              >
                <Mail className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </footer>

      {/* Video Modal */}
      <Dialog open={showVideoModal} onOpenChange={setShowVideoModal}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Watch 60s Tour</DialogTitle>
          </DialogHeader>
          <div className="aspect-video w-full rounded-lg overflow-hidden bg-slate-900">
            {/* Placeholder for video - replace with actual video URL */}
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center text-white">
                <Play className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-sm opacity-75">Video tour coming soon</p>
                <p className="text-xs mt-2 opacity-50">Replace this with your video embed code</p>
              </div>
              {/* Uncomment and add your video embed code here:
              <iframe
                className="w-full h-full"
                src="YOUR_VIDEO_URL_HERE"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
              */}
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
