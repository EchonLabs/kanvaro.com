'use client'

/**
 * Sprint Planning Workspace (spec §15.5).
 *
 * Route: `/sprints/[id]/planning`, alongside `/sprints/[id]` rather than nested
 * under a project — Kanvaro addresses sprints directly by their own id, and the
 * planning screen belongs to the sprint (see docs/api-route-structure.md).
 */
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, CalendarRange, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { MainLayout } from '@/components/layout/MainLayout'
import { PlanningWorkspace } from '@/components/standup/PlanningWorkspace'
import { PermissionGate } from '@/lib/permissions/permission-components'
import { Permission } from '@/lib/permissions/permission-definitions'
import { describeWaiver } from '@/lib/standup/planning-gate'

export default function SprintPlanningPage() {
  const params = useParams()
  const router = useRouter()
  const sprintId = String(params?.id ?? '')

  const [sprint, setSprint] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // "planning" is dropped by the auto-generator (it follows the sprint id).
  // Passed as a prop, not via `useBreadcrumb()` — that hook's provider lives
  // inside `MainLayout`, below this component in the tree, so a page-level
  // call to it can never reach the provider and silently no-ops. All three
  // `<MainLayout>` render paths below (loading, error, and the real content)
  // need it passed individually. Includes the project trail (see the sprint
  // detail page's own breadcrumb comment) so this screen doesn't strand a
  // user who arrived via a project rather than the global Sprints list;
  // falls back to the flat crumb until the sprint (and its project) loads.
  const breadcrumbItems = sprint?.project?._id
    ? [
        { label: 'Projects', href: '/projects' },
        { label: 'View Project', href: `/projects/${sprint.project._id}` },
        { label: 'View Sprint', href: `/sprints/${sprintId}` },
        { label: 'Planning' }
      ]
    : [
        { label: 'Sprints', href: '/sprints' },
        { label: 'View Sprint', href: `/sprints/${sprintId}` },
        { label: 'Planning' }
      ]

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/sprints/${sprintId}`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error ?? 'Could not load the sprint')
      setSprint(payload.data ?? payload.sprint ?? payload)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the sprint')
    } finally {
      setLoading(false)
    }
  }, [sprintId])

  useEffect(() => {
    if (sprintId) load()
  }, [sprintId, load])

  if (loading) {
    return (
      <MainLayout breadcrumbItems={breadcrumbItems}>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--apple-tertiary-label)]" />
        </div>
      </MainLayout>
    )
  }

  // PLN-18 — the banner text is derived from the sprint's own waiver so the
  // screen cannot show a stale one after a revoke.
  const waiverBanner = describeWaiver(
    sprint?.planningWaiver
      ? {
          waivedCheckIds: sprint.planningWaiver.waivedCheckIds ?? [],
          justification: sprint.planningWaiver.justification,
          issuedBy: String(sprint.planningWaiver.issuedBy ?? ''),
          issuedAt: new Date(sprint.planningWaiver.issuedAt),
          expiresAt: new Date(sprint.planningWaiver.expiresAt),
          revokedAt: sprint.planningWaiver.revokedAt
            ? new Date(sprint.planningWaiver.revokedAt)
            : null
        }
      : null
  )

  if (error || !sprint) {
    return (
      <MainLayout breadcrumbItems={breadcrumbItems}>
        <div className="p-6">
          <p className="text-[13px] text-[var(--apple-secondary-label)]">
            {error ?? 'That sprint could not be found.'}
          </p>
          <Button variant="outline" className="mt-4" onClick={() => router.push('/sprints')}>
            Back to sprints
          </Button>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout breadcrumbItems={breadcrumbItems}>
      <div className="space-y-6 p-4 sm:p-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/sprints/${sprintId}`)}
          className="-ml-2"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to {sprint.name}
        </Button>

        <div className="flex items-center gap-3">
          <CalendarRange className="h-8 w-8 flex-shrink-0 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
          <div>
            <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight text-[var(--apple-label)]">
              Sprint planning
            </h1>
            <p className="text-[15px] text-[var(--apple-secondary-label)] mt-0.5">
              {sprint.name} · <span className="capitalize">{sprint.status}</span>
            </p>
          </div>
        </div>

        <PermissionGate
          permission={Permission.SPRINT_VIEW}
          projectId={sprint.project?._id ?? sprint.project}
        >
          <PlanningWorkspace
            sprintId={sprintId}
            sprintName={sprint.name}
            sprintStatus={sprint.status}
            projectId={sprint.project?._id ?? sprint.project}
            waiverBanner={waiverBanner}
            onCompleted={load}
          />
        </PermissionGate>
      </div>
    </MainLayout>
  )
}
