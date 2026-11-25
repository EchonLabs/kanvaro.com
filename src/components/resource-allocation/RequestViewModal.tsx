'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'

import { RequestSummary, liveReviewLines } from './ApprovalModal'
import { cancelRequest, fetchRequest, type RequestDetail } from './api'
import { ChangeReview } from './ChangeReview'

interface Props {
  requestId: string
  open: boolean
  onClose(): void
  onCancelled(): void
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled'
}

/** A PM's read-only view of a request they made, with the option to withdraw it while pending. */
export function RequestViewModal({ requestId, open, onClose, onCancelled }: Props) {
  const [request, setRequest] = useState<RequestDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setRequest(null)
    setError(null)
    fetchRequest(requestId)
      .then(setRequest)
      .catch((err: Error) => setError(err.message))
  }, [requestId, open])

  const cancel = async () => {
    setBusy(true)
    setError(null)
    try {
      await cancelRequest(requestId)
      onCancelled()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="Allocation Request"
      description={request ? `Your requested change for ${request.member.name}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Close
          </Button>
          {request?.status === 'pending' && (
            <Button variant="destructive" onClick={cancel} disabled={busy}>
              Cancel request
            </Button>
          )}
        </>
      }
      className="sm:max-w-xl lg:max-w-xl"
    >
      {!request && !error && <p className="text-[14px] text-[var(--apple-secondary-label)]">Loading…</p>}
      {request && (
        <div className="space-y-3">
          <p className="inline-block rounded-full bg-[var(--apple-tertiary-fill)] px-2.5 py-1 text-[12px] font-medium text-[var(--apple-label)]">
            {STATUS_LABEL[request.status]}
          </p>
          <RequestSummary request={request} />
          <ChangeReview lines={liveReviewLines(request)} totalAfter={request.liveTotalAfter} threshold={request.threshold} />
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-[var(--apple-system-red)]">
          {error}
        </p>
      )}
    </ResponsiveDialog>
  )
}
