'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Home } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbProps {
  items?: BreadcrumbItem[]
  className?: string
}

export function Breadcrumb({ items: propItems, className }: BreadcrumbProps) {
  const pathname = usePathname()
  const { items: contextItems } = useBreadcrumb()
  
  // Priority: propItems > contextItems > generated from pathname
  const breadcrumbItems = propItems || (contextItems.length > 0 ? contextItems : generateBreadcrumbsFromPath(pathname))

  if (breadcrumbItems.length === 0) return null

  return (
    <nav 
      className={cn(
        "sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b",
        className
      )}
      aria-label="Breadcrumb"
    >
      <div className="mx-auto max-w-7xl px-3 sm:px-4 lg:px-6">
        <ol className="flex items-center space-x-1 sm:space-x-2 py-2 sm:py-3 text-xs sm:text-sm overflow-x-auto">
          <li>
            <Link
              href="/dashboard"
              className="flex items-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <Home className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="sr-only">Home</span>
            </Link>
          </li>
          {breadcrumbItems.map((item, index) => {
            const isLast = index === breadcrumbItems.length - 1
            return (
              <li key={index} className="flex items-center">
                <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground mx-1 sm:mx-2 flex-shrink-0" />
                {isLast ? (
                  <span className="font-medium text-foreground truncate max-w-[150px] sm:max-w-[200px] md:max-w-none" title={item.label}>
                    {item.label}
                  </span>
                ) : item.href ? (
                  <Link
                    href={item.href}
                    className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[150px] sm:max-w-[200px] md:max-w-none"
                    title={item.label}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span className="text-muted-foreground truncate max-w-[150px] sm:max-w-[200px] md:max-w-none" title={item.label}>
                    {item.label}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </nav>
  )
}

function generateBreadcrumbsFromPath(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean)
  const items: BreadcrumbItem[] = []
  
  // Map common routes to readable labels - preserve sub-module names as-is
  const routeLabels: Record<string, string> = {
    'dashboard': 'Dashboard',
    'projects': 'Projects',
    'tasks': 'Tasks',
    'stories': 'Stories',
    'epics': 'Epics',
    'sprints': 'Sprints',
    'backlog': 'Backlog',
    'kanban': 'Kanban',
    'team': 'Team',
    'members': 'Members',
    'settings': 'Settings',
    'time-tracking': 'Time Tracking',
    'timer': 'Timer',
    'reports': 'Reports',
    'create': 'Create',
    'edit': 'Edit',
    'test-management': 'Test Management',
    'suites': 'Test Suites',
    'cases': 'Test Cases',
    'plans': 'Test Plans',
    'executions': 'Test Executions',
    'financial': 'Financial Reports',
    'gantt': 'Gantt Report',
  }
  
  // Special handling for reports sub-modules
  // When "project-reports" appears under "reports", it should be "Project Reports"
  const reportsSubModuleLabels: Record<string, string> = {
    'project-reports': 'Project Reports',
    'projects': 'Project Reports', // Legacy support
    'team': 'Team Reports',
    'financial': 'Financial Reports',
    'gantt': 'Gantt Report',
  }

  // Map entity types to their view labels
  const entityViewLabels: Record<string, string> = {
    'tasks': 'View Task',
    'stories': 'View Story',
    'epics': 'View Epic',
    'sprints': 'View Sprint',
    'projects': 'View Project',
    'executions': 'View Test Execution',
  }

  let currentPath = ''
  let previousSegment = ''
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    currentPath += `/${segment}`
    
    // Check if this is an ID (MongoDB ObjectId or numeric)
    const isId = /^[a-f0-9]{24}$/i.test(segment) || /^\d+$/.test(segment)
    
    // Handle edit pages - show "Edit [Entity]" format
    if (segment === 'edit' && previousSegment) {
      // Check if previous segment was an ID, then get the entity type from before that
      const entityIndex = i - 2
      if (entityIndex >= 0 && entityViewLabels[segments[entityIndex]]) {
        const entityType = segments[entityIndex]
        const entityLabel = routeLabels[entityType] || formatSegment(entityType)
        items.push({
          label: `Edit ${entityLabel}`,
          href: currentPath
        })
      } else {
        const entityLabel = routeLabels[previousSegment] || formatSegment(previousSegment)
        items.push({
          label: `Edit ${entityLabel}`,
          href: currentPath
        })
      }
      previousSegment = segment
      continue
    }
    
    // If this is an ID and previous segment is an entity type, show "View [Entity]"
    if (isId && previousSegment && entityViewLabels[previousSegment]) {
      items.push({
        label: entityViewLabels[previousSegment],
        href: currentPath
      })
      previousSegment = segment
      continue
    }
    
    // Skip IDs in breadcrumb labels if we haven't handled them above
    if (isId) {
      previousSegment = segment
      continue
    }
    
    // Special handling for reports sub-modules
    let label: string
    if (i > 0 && segments[i - 1] === 'reports' && reportsSubModuleLabels[segment]) {
      // This is a reports sub-module, use the special label
      label = reportsSubModuleLabels[segment]
    } else {
      // Determine label - preserve sub-module names as-is if they exist in routeLabels
      label = routeLabels[segment] || formatSegment(segment)
    }
    
    // For detail pages (after an ID), we'll let the page set the label
    // For now, add the parent route
    if (i > 0 && /^[a-f0-9]{24}$/i.test(segments[i - 1])) {
      // Previous segment was an ID, this is likely a sub-page
      // The page should set its own breadcrumb, so skip here
      previousSegment = segment
      continue
    }
    
    items.push({
      label,
      href: currentPath
    })
    
    previousSegment = segment
  }
  
  return items
}

function formatSegment(segment: string): string {
  // Preserve sub-module names as-is (don't transform them)
  // Only format if it's a simple dash-separated word
  if (segment.includes('-') && segment.length > 0) {
    return segment
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }
  return segment.charAt(0).toUpperCase() + segment.slice(1)
}

