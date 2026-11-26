'use client'

import { useEffect, useState } from 'react'
import { BarChart3, Loader2, Save } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { THRESHOLD_MAX, THRESHOLD_MIN } from '@/lib/resource-allocation/workload'

import { fetchThreshold, saveThreshold } from './api'

/**
 * Organisation setting: the total allocation nobody may be pushed above.
 * Lives in Organization Settings for Admin/HR (RESOURCE_ALLOCATION_MANAGE).
 */
export function ThresholdSettingsCard({ onSaved }: { onSaved?: (value: number) => void }) {
  const [saved, setSaved] = useState<number | null>(null)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchThreshold()
      .then(({ overAllocationThresholdPercent }) => {
        setSaved(overAllocationThresholdPercent)
        setValue(String(overAllocationThresholdPercent))
      })
      .catch((err: Error) => setError(err.message))
  }, [])

  const parsed = Number(value)
  const valid = Number.isInteger(parsed) && parsed >= THRESHOLD_MIN && parsed <= THRESHOLD_MAX
  const changed = saved !== null && parsed !== saved

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const result = await saveThreshold(parsed)
      setSaved(result.overAllocationThresholdPercent)
      onSaved?.(result.overAllocationThresholdPercent)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none">
      <div className="flex items-center gap-3 border-b border-[var(--apple-separator)] px-5 py-4">
        <BarChart3 className="h-5 w-5 flex-shrink-0 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
        <div>
          <p className="text-[15px] font-semibold text-[var(--apple-label)]">Resource allocation</p>
          <p className="mt-0.5 text-[12px] text-[var(--apple-secondary-label)]">
            Nobody can be allocated above this total across all active projects.
          </p>
        </div>
      </div>
      <div className="space-y-3 px-5 py-5">
        <div className="max-w-xs space-y-1.5">
          <label htmlFor="ra-threshold" className="block text-[13px] font-medium text-[var(--apple-label)]">
            Over-allocation threshold (%)
          </label>
          <input
            id="ra-threshold"
            type="number"
            inputMode="numeric"
            min={THRESHOLD_MIN}
            max={THRESHOLD_MAX}
            step={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="h-9 w-32 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-transparent px-3 text-[13px] tabular-nums text-[var(--apple-label)] focus:outline-none focus:ring-2 focus:ring-[var(--apple-system-blue)]"
          />
          {value !== '' && !valid ? (
            <span className="block text-[11px] text-[var(--apple-system-red)]">
              Enter a whole number between {THRESHOLD_MIN} and {THRESHOLD_MAX}.
            </span>
          ) : (
            <span className="block text-[11px] text-[var(--apple-tertiary-label)]">
              100% is one person’s full capacity. Set higher to allow planned overtime.
            </span>
          )}
        </div>
        {error && (
          <p role="alert" className="text-[12px] text-[var(--apple-system-red)]">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          {/* Same button as the other Organization Settings cards. */}
          <Button
            onClick={save}
            disabled={!valid || !changed || saving}
            className="h-9 gap-2 rounded-[var(--apple-radius-sm)] px-4 text-[13px] apple-transition"
            style={{ background: 'var(--apple-card-gradient)' }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> : <Save className="h-3.5 w-3.5" strokeWidth={1.5} />}
            {saving ? 'Saving…' : 'Save threshold'}
          </Button>
        </div>
      </div>
    </div>
  )
}
