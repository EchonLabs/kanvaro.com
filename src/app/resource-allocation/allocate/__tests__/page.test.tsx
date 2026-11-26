/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }))
jest.mock('@/components/layout/MainLayout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))
jest.mock('@/components/ui/PageContent', () => ({
  PageContent: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))
jest.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => ({ user: { id: 'hr' } }) }))
jest.mock('@/lib/notify', () => ({ useNotify: () => ({ success: jest.fn(), error: jest.fn() }) }))
jest.mock('@/components/resource-allocation/useResourceAllocationAccess', () => ({
  useResourceAllocationAccess: () => ({ loading: false, canEdit: false, canManage: false })
}))

import AllocateResourcePage from '@/app/resource-allocation/allocate/page'

describe('Allocate Resource page', () => {
  it('adds no padding or width cap of its own, since MainLayout already pads and sizes the content', () => {
    render(<AllocateResourcePage />)

    const root = screen.getByTestId('allocate-page')
    expect(root.className).not.toMatch(/(^|\s)(md:|sm:|lg:)?(p[xytblr]?-\d|max-w-|mx-auto)/)
  })
})
