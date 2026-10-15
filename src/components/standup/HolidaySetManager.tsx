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
import { AlertTriangle, CalendarPlus, Loader2, Plus, RefreshCw, Undo2, Upload } from 'lucide-react'

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
import { cn } from '@/lib/utils'

const REVOKE_REASON_MIN_LENGTH = 20

interface HolidaySetSummary {
  id: string
  name: string
  countryCode?: string
  count: number
  from?: string
  to?: string
  source?: 'manual' | 'api'
  lastRefreshedAt?: string | null
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

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

/**
 * Groups holidays by calendar year so the year can be a single collective
 * label above a block of tiles, rather than repeating on every row the way
 * the old table's date column did. Sorted ascending, both years and the
 * dates within a year.
 */
function groupByYear(holidays: HolidayRow[]): Array<[string, HolidayRow[]]> {
  const byYear = new Map<string, HolidayRow[]>()
  for (const holiday of holidays) {
    const year = holiday.date.slice(0, 4)
    const existing = byYear.get(year)
    if (existing) existing.push(holiday)
    else byYear.set(year, [holiday])
  }

  return Array.from(byYear.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, rows]) => [year, [...rows].sort((a, b) => a.date.localeCompare(b.date))])
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
  const [refreshing, setRefreshing] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [defaultHolidaySetId, setDefaultHolidaySetId] = useState<string | null>(null)
  const [savingDefault, setSavingDefault] = useState(false)

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
      const body = data.data ?? data
      const loaded: HolidaySetSummary[] = body.holidaySets ?? []
      setSets(loaded)
      setSelectedId((current) => current ?? loaded[0]?.id ?? null)
      setDefaultHolidaySetId(body.defaultHolidaySetId ?? null)
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

  const loadApiKeyStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/organization/holiday-sets/api-key')
      if (!response.ok) return
      const data = await response.json()
      setHasApiKey(Boolean(data.hasApiKey ?? data.data?.hasApiKey))
    } catch {
      // Non-critical: the refresh button simply calls the API keyless if this fails.
    }
  }, [])

  useEffect(() => {
    void loadSets()
    void loadApiKeyStatus()
  }, [loadSets, loadApiKeyStatus])

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

    if (reason.trim().length < REVOKE_REASON_MIN_LENGTH) {
      notifyError({
        title: `That reason is too short — give at least ${REVOKE_REASON_MIN_LENGTH} characters so whoever reads the calendar next knows why.`
      })
      return
    }

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

  const setAsDefault = async (holidaySetId: string) => {
    setSavingDefault(true)
    try {
      const response = await fetch('/api/organization/holiday-sets/default', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holidaySetId })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error?.message ?? 'Could not set the default calendar')

      setDefaultHolidaySetId(holidaySetId)
      notifySuccess({ title: 'Global default calendar updated' })
    } catch (error) {
      notifyError({ title: (error as Error).message })
    } finally {
      setSavingDefault(false)
    }
  }

  const refreshFromApi = async () => {
    setRefreshing(true)
    try {
      const response = await fetch('/api/organization/holiday-sets/refresh', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error?.message ?? 'Could not refresh from the API')

      const summary = data.data ?? data
      notifySuccess({
        title: 'Sri Lanka Public Holidays refreshed',
        message: `${summary.fetched} fetched, ${summary.inserted} added, ${summary.updated} updated${
          summary.skippedRevoked ? `, ${summary.skippedRevoked} withdrawn dates left untouched` : ''
        }.`
      })
      await loadSets()
      setSelectedId(summary.setId ?? null)
      if (summary.setId) await loadHolidays(summary.setId)
    } catch (error) {
      notifyError({ title: (error as Error).message })
    } finally {
      setRefreshing(false)
    }
  }

  const saveApiKey = async () => {
    if (!apiKeyInput.trim()) return
    setSavingKey(true)
    try {
      const response = await fetch('/api/organization/holiday-sets/api-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKeyInput.trim() })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error?.message ?? 'Could not save the API key')

      notifySuccess({ title: 'API key saved' })
      setApiKeyInput('')
      setHasApiKey(true)
    } catch (error) {
      notifyError({ title: (error as Error).message })
    } finally {
      setSavingKey(false)
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

            <Button variant="outline" onClick={refreshFromApi} disabled={refreshing || busy}>
              {refreshing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh from API
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <Label htmlFor="holiday-default">Global default calendar</Label>
              <Select
                value={defaultHolidaySetId ?? ''}
                onValueChange={setAsDefault}
                disabled={savingDefault || sets.length === 0}
              >
                <SelectTrigger id="holiday-default">
                  <SelectValue placeholder="Choose the default calendar" />
                </SelectTrigger>
                <SelectContent>
                  {sets.map((set) => (
                    <SelectItem key={set.id} value={set.id}>
                      {set.name}
                      {set.source === 'api' ? ' — API' : ' — Seeded/manual'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Every project without its own calendar inherits this one.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <Label htmlFor="holiday-api-key">induwara.lk API key</Label>
              <Input
                id="holiday-api-key"
                type="password"
                value={apiKeyInput}
                placeholder={hasApiKey ? 'Key configured — enter a new key to replace it' : 'Paste your API key'}
                onChange={(event) => setApiKeyInput(event.target.value)}
              />
            </div>
            <Button
              variant="outline"
              onClick={saveApiKey}
              disabled={savingKey || !apiKeyInput.trim()}
            >
              {savingKey ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save key
            </Button>
          </div>

          {selected?.source === 'api' ? (
            <p className="text-xs text-muted-foreground">
              Populated from the induwara.lk public holidays API.{' '}
              {selected.lastRefreshedAt
                ? `Last refreshed ${new Date(selected.lastRefreshedAt).toLocaleString()}.`
                : 'Not refreshed yet.'}
            </p>
          ) : null}

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
            <div className="space-y-5">
              {groupByYear(visible).map(([year, rows]) => (
                <div key={year} className="space-y-2">
                  <p className="apple-section-label text-[var(--apple-tertiary-label)]">{year}</p>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2.5">
                    {rows.map((holiday) => (
                      <HolidayTile
                        key={holiday.id}
                        holiday={holiday}
                        busy={busy}
                        onWithdraw={revokeHoliday}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * One calendar-square tile: date + month prominent, type carried by both a
 * colour accent and its text label (NFR-A1), the holiday's full name in a
 * tooltip rather than crammed into the square. Withdrawing (DO-3 — this
 * never deletes) is a small always-visible affordance in the corner rather
 * than a separate table action column.
 */
function HolidayTile({
  holiday,
  busy,
  onWithdraw
}: {
  holiday: HolidayRow
  busy: boolean
  onWithdraw: (holiday: HolidayRow) => void
}) {
  const revoked = holiday.status === 'revoked'
  const [, monthPart, dayPart] = holiday.date.split('-')
  const day = Number(dayPart)
  const month = MONTH_ABBR[Number(monthPart) - 1] ?? monthPart

  return (
    <div
      title={
        revoked
          ? `${holiday.name} — withdrawn${holiday.revokeReason ? `: ${holiday.revokeReason}` : ''}`
          : holiday.name
      }
      // The org's own accent theme (Settings → Organization → Accent Theme,
      // `--apple-chart-*` tokens) drives this tile's colour rather than a
      // fixed red/orange/blue per type — the same tokens `GradientProgress`
      // and every stat tile elsewhere in the app already read, so the
      // calendar matches whatever theme is actually selected instead of
      // three colours that never moved with it.
      style={!revoked ? { borderTopColor: 'var(--apple-chart-gradient)', borderTopWidth: '3px' } : undefined}
      className={cn(
        'apple-transition relative flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-[var(--apple-radius-md)] border bg-card p-2 text-center',
        revoked
          ? 'border-[var(--apple-separator)] opacity-45'
          : 'border-[var(--apple-separator)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 hover:shadow-[0_4px_16px_var(--apple-chart-glow)]'
      )}
    >
      {!revoked && (
        <button
          type="button"
          onClick={() => onWithdraw(holiday)}
          disabled={busy}
          aria-label={`Withdraw ${holiday.name}`}
          className="apple-transition absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-[var(--apple-tertiary-label)] hover:bg-[var(--apple-quaternary-fill)] hover:text-[var(--apple-system-red)] disabled:pointer-events-none disabled:opacity-40"
        >
          <Undo2 className="h-3 w-3" />
        </button>
      )}

      <span
        className={cn(
          'font-apple-mono text-[22px] font-bold leading-none tabular-nums',
          revoked ? 'text-[var(--apple-tertiary-label)] line-through' : 'text-[var(--apple-label)]'
        )}
      >
        {day}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--apple-tertiary-label)]">
        {month}
      </span>
      <span
        className="text-[10px] font-medium"
        style={{ color: revoked ? 'var(--apple-tertiary-label)' : 'var(--apple-chart-to)' }}
      >
        {revoked ? 'Withdrawn' : TYPE_LABELS[holiday.type]}
      </span>
    </div>
  )
}
