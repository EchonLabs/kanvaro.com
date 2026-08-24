import { JobHeartbeat } from '@/models/JobHeartbeat'
import { getActiveDegradations } from '@/lib/standup/degradation'
import * as healthRoute from '@/app/api/standup/health/route'

import { ids, syncIndexes, useMongo } from './helpers/mongo'

describe('stand-up health route', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(JobHeartbeat)
  })

  it('exposes a GET handler and opts out of static rendering', () => {
    expect(typeof healthRoute.GET).toBe('function')
    // Without this the degradation feed would be cached at build time and every
    // reader would see whatever was true when the image was built.
    expect(healthRoute.dynamic).toBe('force-dynamic')
  })

  it('produces a payload that survives JSON transport', async () => {
    const degradations = await getActiveDegradations({
      organizationId: ids.organization.toString()
    })
    expect(degradations.length).toBeGreaterThan(0)

    const round = JSON.parse(JSON.stringify({ degradations }))

    for (const degradation of round.degradations) {
      expect(typeof degradation.code).toBe('string')
      expect(['info', 'warning', 'blocking']).toContain(degradation.severity)
      expect(degradation.message.length).toBeGreaterThan(0)
      // Date became a string; it must still parse, because the banner sorts on it.
      expect(Number.isNaN(Date.parse(degradation.detectedAt))).toBe(false)
    }
  })
})
