'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { MainLayout } from '@/components/layout/MainLayout'
import { PageContent } from '@/components/ui/PageContent'
import { useAuthContext } from '@/contexts/AuthContext'
import { AllocateWizard } from '@/components/resource-allocation/AllocateWizard'
import { useResourceAllocationAccess } from '@/components/resource-allocation/useResourceAllocationAccess'
import { useNotify } from '@/lib/notify'

export default function AllocateResourcePage() {
  const access = useResourceAllocationAccess()
  const { user } = useAuthContext()
  const router = useRouter()
  const notify = useNotify()

  return (
    <MainLayout>
      <PageContent>
        {/* No padding or width cap of its own: MainLayout already pads and sizes the content. */}
        <div data-testid="allocate-page" className="space-y-5">
          <Link
            href="/resource-allocation"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--apple-system-blue)] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Resource Allocation
          </Link>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[var(--apple-label)]">Allocate Resource</h1>

          {!access.loading && !access.canEdit ? (
            <p className="text-[14px] text-[var(--apple-secondary-label)]">
              You don’t have permission to change allocations.
            </p>
          ) : (
            <AllocateWizard
              mode={access.canManage ? 'apply' : 'request'}
              currentUserId={user?.id}
              onDone={({ mode }) => {
                notify.success({
                  title: mode === 'applied' ? 'Allocation saved' : 'Shared to approvals',
                  message:
                    mode === 'applied'
                      ? 'The allocation sheet has been updated.'
                      : 'HR will review the change before it is applied.'
                })
                router.push('/resource-allocation')
              }}
            />
          )}
        </div>
      </PageContent>
    </MainLayout>
  )
}
