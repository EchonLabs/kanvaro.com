'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Info } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'

import { ApiError, approveRequest, fetchRequest, rejectRequest, type RequestDetail } from './api'
import { ChangeHeader } from './ChangeHeader'
import { ChangeReview } from './ChangeReview'

interface Props {
  requestId: string
  open: boolean
  onClose(): void
  onDecided(decision: 'approved' | 'rejected'): void
}

const STATUS_TEXT: Record<string, string> = {
  approved: 'This request was approved.',
  rejected: 'This request was rejected.',
  cancelled: 'This request was cancelled by the requester.'
}

/** The requester, their reason, and when they asked. Shared with the requester's own view. */
export function RequestSummary({ request }: { request: RequestDetail }) {
  return (
    <div className="rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] p-3 text-[13px]">
      <p className="text-[var(--apple-secondary-label)]">
        Requested by{' '}
        <span className="font-medium text-[var(--apple-label)]">
          {request.requestedBy.name}
          {request.requestedBy.roleLabel ? ` (${request.requestedBy.roleLabel})` : ''}
        </span>{' '}
        on {new Date(request.createdAt).toLocaleDateString()}
      </p>
      <p className="mt-2 text-[11px] font-semibold text-[var(--apple-secondary-label)]">Reason</p>
      <p className="whitespace-pre-wrap text-[var(--apple-label)]">{request.reason}</p>
      {request.decisionNote && (
        <>
          <p className="mt-2 text-[11px] font-semibold text-[var(--apple-secondary-label)]">Decision note</p>
          <p className="whitespace-pre-wrap text-[var(--apple-label)]">{request.decisionNote}</p>
        </>
      )}
    </div>
  )
}

/** The live effect of a request: what changes from today's values, not from the values at submit time. */
export function liveReviewLines(request: RequestDetail) {
  return request.lines.filter((line) => line.active !== false).map((line) => ({
    projectName: line.projectName,
    previousPercent: line.currentPercent,
    newPercent: line.newPercent
  }))
}

/**
 * Admin/HR decide a PM's request. Confirm stays disabled until any drift since
 * submit has been acknowledged, and while the live result would breach the
 * threshold (the server refuses that too — HR rejects instead).
 */
export function ApprovalModal({ requestId, open, onClose, onDecided }: Props) {
  const [request, setRequest] = useState<RequestDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setRequest(null)
    setAcknowledged(false)
    setNote('')
    setError(null)
    setLoadError(null)
    fetchRequest(requestId)
      .then(setRequest)
      .catch((err: Error) => setLoadError(err.message))
  }, [requestId, open])

  /** The sheet moved while the modal was open: show what is true now, and ask again. */
  const reload = async () => {
    try {
      setRequest(await fetchRequest(requestId))
      setAcknowledged(false)
    } catch {
      // Keep the current view; the error message already explains what happened.
    }
  }

  const decide = async (decision: 'approved' | 'rejected') => {
    setBusy(true)
    setError(null)
    try {
      if (decision === 'approved') await approveRequest(requestId, acknowledged)
      else await rejectRequest(requestId, note.trim() || undefined)
      onDecided(decision)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      if (err instanceof ApiError && ['STALE_REQUEST_UNACKNOWLEDGED', 'OVER_THRESHOLD', 'VALIDATION_FAILED', 'REQUEST_NOT_PENDING'].includes(err.code)) {
        await reload()
      }
    } finally {
      setBusy(false)
    }
  }

  const pending = request?.status === 'pending'
  const inactiveLines = request?.lines.filter((line) => line.active === false) ?? []
  const driftedLines = request?.lines.filter((line) => line.currentPercent !== line.previousPercent) ?? []
  const confirmDisabled =
    busy || !request || inactiveLines.length > 0 || request.exceedsThresholdNow || (request.stale && !acknowledged)

  const footer = !request ? undefined : pending ? (
    <>
      <Button variant="ghost" onClick={onClose} disabled={busy}>
        Cancel
      </Button>
      <Button variant="outline" onClick={() => decide('rejected')} disabled={busy}>
        Reject
      </Button>
      <Button onClick={() => decide('approved')} disabled={confirmDisabled}>
        Confirm
      </Button>
    </>
  ) : (
    <Button variant="outline" onClick={onClose}>
      Close
    </Button>
  )

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="Confirm Allocation Change"
      description={request ? `Review the changes for ${request.member.name} before updating their allocation` : undefined}
      footer={footer}
      headerClassName="text-center sm:text-center"
      className="sm:max-w-xl lg:max-w-xl"
    >
      {loadError && (
        <p role="alert" className="text-[14px] text-[var(--apple-system-red)]">
          Couldn’t load this request: {loadError}
        </p>
      )}
      {!request && !loadError && <p className="text-[14px] text-[var(--apple-secondary-label)]">Loading…</p>}

      {request && (
        <div className="space-y-3">
          <ChangeHeader memberName={request.member.name} />
          <RequestSummary request={request} />

          {!pending && (
            <p className="rounded-[var(--apple-radius-md)] bg-[var(--apple-quaternary-fill)] px-3 py-2 text-[13px] text-[var(--apple-label)]">
              {STATUS_TEXT[request.status]}
            </p>
          )}

          <ChangeReview lines={liveReviewLines(request)} totalAfter={request.liveTotalAfter} threshold={request.threshold} />

          {pending && request.stale && (
            <div className="space-y-2 rounded-[var(--apple-radius-md)] bg-[color-mix(in_srgb,var(--apple-system-orange)_12%,transparent)] px-3 py-2 text-[13px] text-[var(--apple-label)]">
              <p>
                This person’s allocation changed since this request was made:{' '}
                {driftedLines
                  .map((line) => `${line.projectName} was ${line.previousPercent}%, now ${line.currentPercent}%`)
                  .join('; ')}
                . Approving sets the values shown above.
              </p>
              <label className="flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="h-4 w-4"
                />
                I’ve reviewed the current values
              </label>
            </div>
          )}

          {pending && inactiveLines.length > 0 && (
            <p className="flex items-center gap-2 rounded-[var(--apple-radius-md)] bg-[color-mix(in_srgb,var(--apple-system-orange)_12%,transparent)] px-3 py-2 text-[13px] text-[var(--apple-label)]">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 text-[var(--apple-system-orange)]" />
              {inactiveLines.map((line) => line.projectName).join(', ')} {inactiveLines.length === 1 ? 'is' : 'are'} no longer
              active, so this request can only be rejected.
            </p>
          )}

          {pending && inactiveLines.length === 0 && request.exceedsThresholdNow && (
            <p
              role="alert"
              className="flex items-center gap-2 rounded-[var(--apple-radius-md)] bg-[color-mix(in_srgb,var(--apple-system-red)_10%,transparent)] px-3 py-2 text-[13px] text-[var(--apple-system-red)]"
            >
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              Allocation exceeds available capacity by {request.liveTotalAfter - request.threshold}%.
            </p>
          )}

          {pending && (
            <>
              <p className="flex items-center gap-2 rounded-[var(--apple-radius-md)] bg-[color-mix(in_srgb,var(--apple-system-blue)_8%,transparent)] px-3 py-2 text-[13px] text-[var(--apple-system-blue)]">
                <Info className="h-4 w-4 flex-shrink-0" />
                This updates the central allocation sheet.
              </p>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-[var(--apple-label)]">
                  Note to the requester (optional)
                </span>
                <textarea
                  value={note}
                  maxLength={500}
                  rows={2}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Shown to the requester if you reject"
                  className="w-full rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-transparent px-3 py-2 text-[13px] text-[var(--apple-label)] placeholder:text-[var(--apple-tertiary-label)] focus:outline-none focus:ring-2 focus:ring-[var(--apple-system-blue)]"
                />
              </label>
            </>
          )}

          {error && (
            <p role="status" className="text-[13px] text-[var(--apple-system-red)]">
              {error}
            </p>
          )}
        </div>
      )}
    </ResponsiveDialog>
  )
}
