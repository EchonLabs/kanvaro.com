'use client'

/**
 * Organisation holiday administration (plan §5, DO-1..DO-6).
 *
 * The screen exists because holiday sets are perpetual and topped up each time a
 * gazette is published. Before it, the only way to load a new year was
 * `npm run seed:holidays` — shell access to the container — and the person
 * holding the gazette is an administrator, not a sysadmin.
 *
 * Two behaviours are requirements rather than niceties:
 *
 * - **DO-3** nothing here deletes. Withdrawing a holiday revokes it, keeping the
 *   row so the calendar a completed stand-up already resolved against stays true.
 * - **DO-4** a set that has run out of loaded dates says so at the top, because
 *   silently treating an unloaded year as all-working-days is the worst failure
 *   mode this module has.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarPlus, Check, Loader2, Plus, Undo2, Upload } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useNotify } from '@/lib/notify'

const REVOKE_REASON_MIN_LENGTH = 20

interface HolidaySetSummary {
  id: string
  name: string
  countryCode?: string
  count: number
  from?: string
  to?: string
}

interface HolidayRow {
  id: string
  name: string
  date: string
  type: 'public' | 'company' | 'optional'
  isFullDay: boolean
  status: 'active' | 'revoked'
  revokeReason?: string
}

const TYPE_LABELS: Record<HolidayRow['type'], string> = {
  public: 'Public',
  company: 'Company',
  optional: 'Optional'
}

/** The year a set has to reach before it stops being a scheduling risk. */
const nextYear = new Date().getFullYear() + 1

export function HolidaySetManager() {
  const { success: notifySuccess, error: notifyError } = useNotify()

  const [sets, setSets] = useState<HolidaySetSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [holidays, setHolidays] = useState<HolidayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showRevoked, setShowRevoked] = useState(false)

  const [draft, setDraft] = useState({
    name: '',
    date: '',
    type: 'public' as HolidayRow['type']
  })

  const selected = useMemo(
    () => sets.find((set) => set.id === selectedId) ?? null,
    [sets, selectedId]
  )

  const loadSets = useCallback(async () => {
    try {
      const response = await fetch('/api/organization/holiday-sets')
      if (!response.ok) throw new Error('Could not load holiday calendars')
      const data = await response.json()
      const loaded: HolidaySetSummary[] = data.sets ?? data.data?.sets ?? []
      setSets(loaded)
      setSelectedId((current) => current ?? loaded[0]?.id ?? null)
    } catch {
      notifyError({ title: 'Could not load holiday calendars' })
    } finally {
      setLoading(false)
    }
  }, [notifyError])

  const loadHolidays = useCallback(
    async (setId: string) => {
      try {
        const response = await fetch(`/api/organization/holiday-sets/${setId}/holidays`)
        if (!response.ok) throw new Error('failed')
        const data = await response.json()
        setHolidays(data.holidays ?? data.data?.holidays ?? [])
      } catch {
        notifyError({ title: 'Could not load holidays' })
      }
    },
    [notifyError]
  )

  useEffect(() => {
    void loadSets()
  }, [loadSets])

  useEffect(() => {
    if (selectedId) void loadHolidays(selectedId)
  }, [selectedId, loadHolidays])

  /**
   * DO-4: derived from the rows themselves. A stored "covered until" field would
   * go stale at exactly the moment someone is relying on it.
   */
  const coverage = useMemo(() => {
    const active = holidays.filter((holiday) => holiday.status !== 'revoked')
    if (active.length === 0) return { lastDate: null as string | null, shortfall: true }
    const lastDate = active.reduce((max, h) => (h.date > max ? h.date : max), active[0].date)
    return { lastDate, shortfall: lastDate.slice(0, 4) < String(nextYear) }
  }, [holidays])

  const visible = showRevoked ? holidays : holidays.filter((h) => h.status !== 'revoked')

  const addHoliday = async () => {
    if (!selectedId) return
    setBusy(true)
    try {
      const response = await fetch(`/api/organization/holiday-sets/${selectedId}/holidays`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, isFullDay: true })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error?.message ?? 'Could not add the holiday')

      notifySuccess({ title: `${draft.name} added` })
      setDraft({ name: '', date: '', type: 'public' })
      await Promise.all([loadHolidays(selectedId), loadSets()])
    } catch (error) {
      notifyError({ title: (error as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const revokeHoliday = async (holiday: HolidayRow) => {
    if (!selectedId) return

    // Deliberately asks for a reason rather than offering a one-click action: the
    // reason is stored and shown to whoever reads the calendar next, so it has to
    // be written by someone who knows why.
    const reason = window.prompt(
      `Withdraw "${holiday.name}" on ${holiday.date}?\n\n` +
        'The date stays on record and keeps its history — it simply stops affecting ' +
        `future stand-ups. Give a reason of at least ${REVOKE_REASON_MIN_LENGTH} characters.`
    )
    if (reason === null) return

    setBusy(true)
    try {
      const response = await fetch(
        `/api/organization/holiday-sets/${selectedId}/holidays/${holiday.id}/revoke`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason })
        }
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error?.message ?? 'Could not withdraw the holiday')

      notifySuccess({ title: `${holiday.name} withdrawn` })
      await Promise.all([loadHolidays(selectedId), loadSets()])
    } catch (error) {
      notifyError({ title: (error as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const importCsv = async (file: File) => {
    if (!selectedId) return
    setBusy(true)
    try {
      const csv = await file.text()
      const response = await fetch(`/api/organization/holiday-sets/${selectedId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error?.message ?? 'Import failed')

      notifySuccess({ title: 'Holidays imported' })
      await Promise.all([loadHolidays(selectedId), loadSets()])
    } catch (error) {
      notifyError({ title: (error as Error).message })
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading holiday calendars…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Holiday calendars</CardTitle>
          <CardDescription>
            Shared by every project in the organisation. Holidays are withdrawn, never deleted, so
            stand-ups that already ran keep the calendar they were scheduled against.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <Label htmlFor="holiday-set">Calendar</Label>
              <Select value={selectedId ?? ''} onValueChange={setSelectedId}>
                <SelectTrigger id="holiday-set">
                  <SelectValue placeholder="Choose a calendar" />
                </SelectTrigger>
                <SelectContent>
                  {sets.map((set) => (
                    <SelectItem key={set.id} value={set.id}>
                      {set.name}
                      {set.countryCode ? ` (${set.countryCode})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button asChild variant="outline" disabled={busy || !selectedId}>
              <label className="cursor-pointer">
                <Upload className="mr-2 h-4 w-4" />
                Import CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void importCsv(file)
                    event.target.value = ''
                  }}
                />
              </label>
            </Button>
          </div>

          {selected && coverage.shortfall ? (
            <div
              role="status"
              className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {coverage.lastDate
                  ? `${selected.name} has no dates loaded after ${coverage.lastDate}. Sprints running past that date will treat public holidays as working days.`
                  : `${selected.name} has no holidays loaded at all. Every date is being treated as a working day.`}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4" />
            Add a holiday
          </CardTitle>
          <CardDescription>
            For a gazette that has not been published as a file yet, or a single correction.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <Label htmlFor="holiday-name">Name</Label>
              <Input
                id="holiday-name"
                value={draft.name}
                placeholder="Thai Pongal"
                onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="holiday-date">Date</Label>
              <Input
                id="holiday-date"
                type="date"
                value={draft.date}
                onChange={(event) => setDraft((d) => ({ ...d, date: event.target.value }))}
              />
            </div>

            <div className="min-w-[160px]">
              <Label htmlFor="holiday-type">Type</Label>
              <Select
                value={draft.type}
                onValueChange={(value) =>
                  setDraft((d) => ({ ...d, type: value as HolidayRow['type'] }))
                }
              >
                <SelectTrigger id="holiday-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public — everyone is off</SelectItem>
                  <SelectItem value="company">Company — organisation closure</SelectItem>
                  <SelectItem value="optional">Optional — only those who observe it</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={addHoliday}
              disabled={busy || !draft.name || !draft.date || !selectedId}
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>
            {selected?.name ?? 'Holidays'}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {visible.length} {visible.length === 1 ? 'date' : 'dates'}
            </span>
          </CardTitle>

          <Button variant="ghost" size="sm" onClick={() => setShowRevoked((v) => !v)}>
            {showRevoked ? 'Hide withdrawn' : 'Show withdrawn'}
          </Button>
        </CardHeader>

        <CardContent>
          {visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No holidays loaded yet. Import a CSV or add one above.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="sr-only py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((holiday) => (
                    <tr key={holiday.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{holiday.date}</td>
                      <td className="py-2 pr-4">{holiday.name}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline">{TYPE_LABELS[holiday.type]}</Badge>
                      </td>
                      <td className="py-2 pr-4">
                        {holiday.status === 'revoked' ? (
                          <span
                            className="text-muted-foreground"
                            title={holiday.revokeReason ?? undefined}
                          >
                            Withdrawn
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Check className="h-3 w-3" />
                            Active
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {holiday.status === 'revoked' ? null : (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => revokeHoliday(holiday)}
                          >
                            <Undo2 className="mr-1 h-3 w-3" />
                            Withdraw
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
