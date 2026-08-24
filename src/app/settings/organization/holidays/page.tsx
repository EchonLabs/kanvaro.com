'use client'

/**
 * Organisation holiday administration (plan DO-1).
 *
 * Sits beside `/settings/organization` rather than inside a project, because a
 * holiday set is shared by every project. Gated on HOLIDAY_MANAGE, which admins
 * and HR hold — HR being the deliberate deviation from spec §3.2, since HR is
 * who actually receives the published gazette.
 */
import { MainLayout } from '@/components/layout/MainLayout'
import { HolidaySetManager } from '@/components/standup/HolidaySetManager'

export default function OrganizationHolidaysPage() {
  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Holidays</h1>
          <p className="text-sm text-muted-foreground">
            Public and company holidays for the whole organisation. Projects subscribe to these
            calendars from their working-calendar settings.
          </p>
        </div>

        <HolidaySetManager />
      </div>
    </MainLayout>
  )
}
