import { StandupOverride } from '@/models/StandupOverride'
import { useMongo, ids } from './helpers/mongo'

useMongo()

const base = (overrides = {}) => ({
  standup: ids.user,
  sprint: ids.sprint,
  project: ids.project,
  organization: ids.organization,
  type: 'under_allocation' as const,
  reasonCode: 'blocked_capacity',
  justification: 'All of Kasun\'s remaining work is blocked on the vendor sandbox.',
  gapMinutes: 180,
  issuedBy: ids.user,
  ...overrides
})

describe('StandupOverride model', () => {
  it('rejects a justification under 20 characters', async () => {
    await expect(StandupOverride.create(base({ justification: 'blocked' }))).rejects.toThrow(/20 characters/)
  })

  it('rejects an unlisted override type', async () => {
    await expect(StandupOverride.create(base({ type: 'unestimated_task_allocation' as any }))).rejects.toThrow()
  })

  it('defaults memberAcknowledged to false', async () => {
    const override = await StandupOverride.create(base())
    expect(override.memberAcknowledged).toBe(false)
  })
})
