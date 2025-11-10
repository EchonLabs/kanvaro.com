'use client'

import { MainLayout } from '@/components/layout/MainLayout'
import { ContentLoader } from '@/components/ui/ContentLoader'

export default function Loading() {
  return (
    <MainLayout>
      <ContentLoader message="Loading timer..." />
    </MainLayout>
  )
}
