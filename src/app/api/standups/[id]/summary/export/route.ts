/**
 * `GET /api/standups/:id/summary/export` — UI-10's export path.
 *
 * `?format=markdown` (the default) returns the real, server-rendered text
 * `renderSummaryMarkdown` produces — the actual export mechanism this module
 * ships with.
 *
 * `?format=pdf` is deliberately **not** a server-rendered binary: this
 * codebase has no PDF library in `package.json`, and the plan's Architecture
 * note is explicit that PDF is delivered from the summary *screen* itself via
 * `window.print()` and a `@media print` stylesheet. Answering `?format=pdf`
 * with a silent 200 of the wrong content type would look like a working
 * export that quietly produces garbage, so this responds `501` with a body
 * pointing the caller at the screen's Print action instead.
 */
import { NextRequest, NextResponse } from 'next/server'

import { Permission } from '@/lib/permissions/permission-definitions'
import { getSummary, renderSummaryMarkdown } from '@/lib/standup/summary-service'
import { withStandupIdPermission } from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

export const GET = withStandupIdPermission(
  { permission: Permission.STANDUP_VIEW },
  async (request: NextRequest, { standupId }) => {
    const format = request.nextUrl.searchParams.get('format') ?? 'markdown'

    if (format === 'pdf') {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_IMPLEMENTED',
            message: 'PDF export is available from the summary screen’s Print action.'
          }
        },
        { status: 501 }
      )
    }

    const summary = await getSummary(standupId)
    const body = renderSummaryMarkdown(summary)

    return new NextResponse(body, {
      status: 200,
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' }
    })
  }
)
