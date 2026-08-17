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
import { ArrowLeft, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/Button'
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
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--apple-tertiary-label)]" />
      </div>
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
      <div className="mx-auto max-w-2xl p-6 text-center">
        <p className="text-[13px] text-[var(--apple-secondary-label)]">
          {error ?? 'That sprint could not be found.'}
        </p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/sprints')}>
          Back to sprints
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push(`/sprints/${sprintId}`)}
        className="-ml-2"
      >
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        {sprint.name}
      </Button>

      <PermissionGate permission={Permission.SPRINT_VIEW} projectId={sprint.project?._id ?? sprint.project}>
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
  )
}
