/**
 * CAL-15 and SCH-16: the consolidated calendar-change notification.
 *
 * CAL-15's whole point is a count — one notification per recipient no matter how
 * many dates moved — so these tests assert how many were created, not just that
 * one was. A regression here is silent and only shows up as a PM with forty
 * unread messages.
 */
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { notificationService } from '@/lib/notification-service'
import type { CalendarImpactItem } from '../calendar-impact'
import {
  isNotificationEnabled,
  notifyCalendarChange,
  notifyCalendarChangeSafely
} from '../notifications'
import { ids, useMongo } from './helpers/mongo'

const { organization, project, user, otherMember } = ids

const item = (partial: Partial<CalendarImpactItem> = {}): CalendarImpactItem => ({
  date: '2026-08-21',
  disposition: 'skip',
  message: 'The stand-up on 21 Aug will be skipped.',
  blocked: false,
  ...partial
})

/**
 * `createNotification` reads the user's preferences and writes a document. The
 * user collection is out of scope here, so it is stubbed and asserted on
 * directly — what matters is how many times it is called and with what.
 */
let createNotification: jest.SpyInstance

beforeEach(() => {
  createNotification = jest
    .spyOn(notificationService, 'createNotification')
    .mockResolvedValue({ _id: 'notification' } as any)
})

afterEach(() => {
  createNotification.mockRestore()
})

const baseInput = {
  projectId: project.toString(),
  organizationId: organization.toString(),
  recipientIds: [user.toString()],
  changeLabel: 'The working week for this project changed.'
}

describe('CAL-15 — one consolidated notification', () => {
  useMongo()

  it('sends exactly one notification for a change affecting ten dates', async () => {
    const items = Array.from({ length: 10 }, (_, index) =>
      item({ date: `2026-08-${String(index + 10).padStart(2, '0')}` })
    )

    const sent = await notifyCalendarChange({ ...baseInput, items })

    expect(sent).toBe(1)
    expect(createNotification).toHaveBeenCalledTimes(1)
  })

  it('sends one per recipient, not one per date', async () => {
    const sent = await notifyCalendarChange({
      ...baseInput,
      recipientIds: [user.toString(), otherMember.toString()],
      items: [item({ date: '2026-08-21' }), item({ date: '2026-08-28' })]
    })

    expect(sent).toBe(2)
    expect(createNotification).toHaveBeenCalledTimes(2)
  })

  it('deduplicates a repeated recipient', async () => {
    const sent = await notifyCalendarChange({
      ...baseInput,
      recipientIds: [user.toString(), user.toString()],
      items: [item()]
    })

    expect(sent).toBe(1)
  })

  it('summarises every category in one message', async () => {
    await notifyCalendarChange({
      ...baseInput,
      items: [
        item({ disposition: 'create' }),
        item({ disposition: 'skip' }),
        item({ disposition: 'skip' }),
        item({ disposition: 'warn_in_progress' }),
        item({ disposition: 'blocked_completed', blocked: true })
      ]
    })

    const { message } = createNotification.mock.calls[0][2]
    expect(message).toContain('1 stand-up will be created.')
    expect(message).toContain('2 stand-ups will be skipped.')
    expect(message).toContain('1 in-progress stand-up needs your attention.')
    expect(message).toContain('1 completed stand-up was left unchanged.')
  })

  it('carries the dates in metadata so the UI need not recompute', async () => {
    await notifyCalendarChange({
      ...baseInput,
      items: [item({ date: '2026-08-21' }), item({ date: '2026-08-28' })]
    })

    const { data } = createNotification.mock.calls[0][2]
    expect(data.metadata.notificationId).toBe('N10')
    expect(data.metadata.dates).toEqual(['2026-08-21', '2026-08-28'])
    expect(data.entityType).toBe('working_calendar')
  })

  it('raises the priority when something was blocked', async () => {
    await notifyCalendarChange({
      ...baseInput,
      items: [item({ disposition: 'blocked_completed', blocked: true })]
    })

    expect(createNotification.mock.calls[0][2].data.priority).toBe('high')
  })
})

describe('when nothing needs saying', () => {
  useMongo()

  it('sends nothing when no date actually changed', async () => {
    const sent = await notifyCalendarChange({
      ...baseInput,
      items: [item({ disposition: 'no_change' })]
    })

    expect(sent).toBe(0)
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('sends nothing for an empty impact', async () => {
    expect(await notifyCalendarChange({ ...baseInput, items: [] })).toBe(0)
  })

  it('sends nothing when there are no recipients', async () => {
    const sent = await notifyCalendarChange({
      ...baseInput,
      recipientIds: [],
      items: [item()]
    })

    expect(sent).toBe(0)
  })
})

describe('SCH-16 — project notification switches', () => {
  useMongo()

  it('defaults to on for a project with no settings row', async () => {
    expect(await isNotificationEnabled(project.toString(), 'N10')).toBe(true)
  })

  it('defaults N3 to off, per the spec default set', async () => {
    expect(await isNotificationEnabled(project.toString(), 'N3')).toBe(false)
  })

  it('respects an explicitly disabled switch', async () => {
    await ProjectStandupSettings.create({
      project,
      organization,
      notificationSwitches: { N10: false }
    })

    expect(await isNotificationEnabled(project.toString(), 'N10')).toBe(false)
  })

  it('does not send N10 when the project has switched it off', async () => {
    await ProjectStandupSettings.create({
      project,
      organization,
      notificationSwitches: { N10: false }
    })

    const sent = await notifyCalendarChange({ ...baseInput, items: [item()] })

    expect(sent).toBe(0)
    expect(createNotification).not.toHaveBeenCalled()
  })
})

describe('notifyCalendarChangeSafely', () => {
  useMongo()

  it('swallows a failure rather than failing the saved calendar change', async () => {
    createNotification.mockRejectedValue(new Error('mail transport down'))
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      notifyCalendarChangeSafely({ ...baseInput, items: [item()] })
    ).resolves.toBe(0)

    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
