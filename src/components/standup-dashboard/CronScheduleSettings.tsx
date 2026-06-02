'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
  Brain, FileText, Clock, CheckCircle2, AlertCircle,
  Loader2, Save, ToggleLeft, ToggleRight
} from 'lucide-react'

type CronFrequency = 'daily' | 'weekdays' | 'weekly'
type CronJobType = 'ai_tracker' | 'summary_generator'
type CronJobStatus = 'idle' | 'running' | 'success' | 'failed'

interface CronJob {
  _id: string
  jobType: CronJobType
  enabled: boolean
  frequency: CronFrequency
  timeHHMM: string
  timezone: string
  lastRunAt?: string
  lastRunStatus: CronJobStatus
  lastRunError?: string
}

interface JobDraft {
  enabled: boolean
  frequency: CronFrequency
  timeHHMM: string
}

const JOB_META: Record<CronJobType, { label: string; desc: string; icon: React.ReactNode }> = {
  ai_tracker: {
    label: 'AI-Project Tracker',
    desc: 'Auto-generates the AI project tracking report and personal performance reports on schedule.',
    icon: <Brain className="h-5 w-5 text-violet-500" />
  },
  summary_generator: {
    label: 'Standup Summary Generator',
    desc: 'Auto-generates summaries for completed standups that have no summary yet.',
    icon: <FileText className="h-5 w-5 text-blue-500" />
  }
}

const FREQUENCY_LABELS: Record<CronFrequency, string> = {
  daily: 'Every day',
  weekdays: 'Weekdays only (Mon–Fri)',
  weekly: 'Weekly (Mondays)'
}

const STATUS_CONFIG: Record<CronJobStatus, { label: string; color: string; icon: React.ReactNode }> = {
  idle:    { label: 'Never run',           color: 'text-muted-foreground', icon: <Clock className="h-3.5 w-3.5" /> },
  running: { label: 'Running now',         color: 'text-amber-500',        icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
  success: { label: 'Last run succeeded',  color: 'text-green-500',        icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  failed:  { label: 'Last run failed',     color: 'text-destructive',      icon: <AlertCircle className="h-3.5 w-3.5" /> }
}

const DEFAULT_DRAFT: JobDraft = { enabled: false, frequency: 'daily', timeHHMM: '09:00' }

interface CronScheduleSettingsProps {
  projectId: string
  canManage: boolean
}

export function CronScheduleSettings({ projectId, canManage }: CronScheduleSettingsProps) {
  const [jobs, setJobs] = useState<Partial<Record<CronJobType, CronJob>>>({})
  const [drafts, setDrafts] = useState<Record<CronJobType, JobDraft>>({
    ai_tracker: { ...DEFAULT_DRAFT },
    summary_generator: { ...DEFAULT_DRAFT }
  })
  const [saving, setSaving] = useState<Partial<Record<CronJobType, boolean>>>({})
  const [saveResult, setSaveResult] = useState<Partial<Record<CronJobType, 'success' | 'error'>>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/projects/${projectId}/cron-schedule`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          const map: Partial<Record<CronJobType, CronJob>> = {}
          const newDrafts = { ...drafts }
          for (const job of json.data as CronJob[]) {
            map[job.jobType] = job
            newDrafts[job.jobType] = { enabled: job.enabled, frequency: job.frequency, timeHHMM: job.timeHHMM }
          }
          setJobs(map)
          setDrafts(newDrafts)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const updateDraft = (type: CronJobType, field: keyof JobDraft, value: any) => {
    setDrafts((prev) => ({ ...prev, [type]: { ...prev[type], [field]: value } }))
    setSaveResult((prev) => ({ ...prev, [type]: undefined }))
  }

  const handleSave = async (type: CronJobType) => {
    setSaving((prev) => ({ ...prev, [type]: true }))
    setSaveResult((prev) => ({ ...prev, [type]: undefined }))
    try {
      const res = await fetch(`/api/projects/${projectId}/cron-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobType: type, ...drafts[type] })
      })
      const json = await res.json()
      if (res.ok && json.success) {
        setJobs((prev) => ({ ...prev, [type]: json.data }))
        setSaveResult((prev) => ({ ...prev, [type]: 'success' }))
      } else {
        setSaveResult((prev) => ({ ...prev, [type]: 'error' }))
      }
    } catch {
      setSaveResult((prev) => ({ ...prev, [type]: 'error' }))
    } finally {
      setSaving((prev) => ({ ...prev, [type]: false }))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading schedules...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {(['ai_tracker', 'summary_generator'] as CronJobType[]).map((type) => {
        const meta = JOB_META[type]
        const draft = drafts[type]
        const job = jobs[type]
        const isSaving = saving[type]
        const result = saveResult[type]
        const statusCfg = STATUS_CONFIG[job?.lastRunStatus || 'idle']

        return (
          <Card key={type}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted shrink-0">
                    {meta.icon}
                  </div>
                  <div>
                    <CardTitle className="text-base">{meta.label}</CardTitle>
                    <CardDescription className="text-xs mt-0.5">{meta.desc}</CardDescription>
                  </div>
                </div>
                <button
                  onClick={() => canManage && updateDraft(type, 'enabled', !draft.enabled)}
                  disabled={!canManage}
                  className="shrink-0 flex items-center gap-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {draft.enabled
                    ? <ToggleRight className="h-7 w-7 text-violet-600" />
                    : <ToggleLeft className="h-7 w-7 text-muted-foreground" />}
                  <span className={draft.enabled ? 'text-violet-600' : 'text-muted-foreground'}>
                    {draft.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {job && (
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span className={`flex items-center gap-1.5 ${statusCfg.color}`}>
                    {statusCfg.icon}
                    {statusCfg.label}
                  </span>
                  {job.lastRunAt && (
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      Last run: {new Date(job.lastRunAt).toLocaleString()}
                    </span>
                  )}
                  {draft.enabled && (
                    <Badge variant="outline" className="text-xs">
                      Bull job registered in Redis
                    </Badge>
                  )}
                  {job.lastRunStatus === 'failed' && job.lastRunError && (
                    <span className="text-destructive text-xs truncate max-w-xs" title={job.lastRunError}>
                      Error: {job.lastRunError}
                    </span>
                  )}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Frequency</label>
                  <select
                    value={draft.frequency}
                    onChange={(e) => updateDraft(type, 'frequency', e.target.value as CronFrequency)}
                    disabled={!canManage || !draft.enabled}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {(Object.entries(FREQUENCY_LABELS) as [CronFrequency, string][]).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Run at (24h)</label>
                  <input
                    type="time"
                    value={draft.timeHHMM}
                    onChange={(e) => updateDraft(type, 'timeHHMM', e.target.value)}
                    disabled={!canManage || !draft.enabled}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {canManage && (
                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-muted-foreground">
                    {!draft.enabled
                      ? 'Enable to register a Bull repeatable job in Redis.'
                      : `Will run ${FREQUENCY_LABELS[draft.frequency].toLowerCase()} at ${draft.timeHHMM}. Worker must be running.`}
                  </p>
                  <div className="flex items-center gap-2">
                    {result === 'success' && (
                      <span className="flex items-center gap-1 text-xs text-green-500">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                      </span>
                    )}
                    {result === 'error' && (
                      <span className="flex items-center gap-1 text-xs text-destructive">
                        <AlertCircle className="h-3.5 w-3.5" /> Failed
                      </span>
                    )}
                    <Button size="sm" variant="outline" onClick={() => handleSave(type)} disabled={isSaving}>
                      {isSaving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                      Save Schedule
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
