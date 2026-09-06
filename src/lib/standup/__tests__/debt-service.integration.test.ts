/**
 * Write-off, carry-in and summary maintenance (Phase 8, Task 9 — VAR-8, VAR-9,
 * NFR-9, E44).
 *
 * The NFR-9 test is the one that matters most and is the easiest to fake:
 * dropping the summary collection and rebuilding must reproduce **identical**
 * numbers. It is asserted by comparing the rebuilt documents against the
 * originals field by field, because a rebuild that quietly rounds, or that
 * loses a member with a zero balance, would still "work" on inspection.
 */
import { EstimateDebtLedger } from '@/models/EstimateDebtLedger'
import { MemberSprintDebtSummary } from '@/models/MemberSprintDebtSummary'
import { Project } from '@/models/Project'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'

import { classifyAndPost } from '../variance-service'
import {
  loadLedger,
  postCarryIn,
  previewCarryIn,
  rebuildDebtSummaries,
  writeOffDebt
} from '../debt-service'

import { ids, syncIndexes, useMongo } from './helpers/mongo'
import { seedWorkedExample } from './helpers/worked-example-seed'

const JUSTIFICATION = 'The estimate was wrong at planning, not a delivery problem.'

/** The write-off notification needs a project document to find its admins. */
async function seedProject(example: { projectId: string; pmId: string }) {
  await Project.create({
    _id: example.projectId,
    name: 'Kanvaro',
    organization: ids.organization,
    createdBy: example.pmId,
    teamMembers: [],
    status: 'active',
    projectNumber: 1,
    startDate: new Date('2026-08-01T00:00:00.000Z')
  })
}

describe('loadLedger', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(EstimateDebtLedger)
  })

  it('returns the entries oldest first with the position alongside', async () => {
    const example = await seedWorkedExample()
    await classifyAndPost({ standupId: example.day4, actor: { userId: example.pmId } })

    const ledger = await loadLedger({
      sprintId: example.sprintId,
      memberId: example.kasunId
    })
    expect(ledger.entries).toHaveLength(1)
    expect(ledger.entries[0]).toMatchObject({ entryType: 'accrual', minutes: 120 })
    expect(ledger.position.outstandingMinutes).toBe(120)
  })

  it('reads an untouched member as an empty ledger, not an error', async () => {
    const example = await seedWorkedExample()
    const ledger = await loadLedger({
      sprintId: example.sprintId,
      memberId: example.amalId
    })
    expect(ledger.entries).toEqual([])
    expect(ledger.position.outstandingMinutes).toBe(0)
  })
})

describe('writeOffDebt (VAR-8, E44)', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(EstimateDebtLedger)
  })

  it('refuses a justification under twenty characters', async () => {
    const example = await seedWorkedExample()
    await classifyAndPost({ standupId: example.day4, actor: { userId: example.pmId } })

    await expect(
      writeOffDebt({
        sprintId: example.sprintId,
        memberId: example.kasunId,
        standupId: example.day4,
        minutes: 120,
        reason: 'sprint was mad',
        actor: { userId: example.pmId }
      })
    ).rejects.toMatchObject({ code: 'INVALID_JUSTIFICATION' })
  })

  it('appends a writeoff entry and clears the outstanding balance', async () => {
    const example = await seedWorkedExample()
    await seedProject(example)
    await classifyAndPost({ standupId: example.day4, actor: { userId: example.pmId } })

    const position = await writeOffDebt({
      sprintId: example.sprintId,
      memberId: example.kasunId,
      standupId: example.day4,
      minutes: 120,
      reason: JUSTIFICATION,
      actor: { userId: example.pmId }
    })

    expect(position.outstandingMinutes).toBe(0)
    expect(await EstimateDebtLedger.countDocuments({ entryType: 'writeoff' })).toBe(1)
    // DAT-4: the accrual it cancels is still there, untouched.
    expect(await EstimateDebtLedger.countDocuments({ entryType: 'accrual' })).toBe(1)
  })

  it('refuses a write-off larger than the outstanding balance', async () => {
    const example = await seedWorkedExample()
    await classifyAndPost({ standupId: example.day4, actor: { userId: example.pmId } })

    await expect(
      writeOffDebt({
        sprintId: example.sprintId,
        memberId: example.kasunId,
        standupId: example.day4,
        minutes: 240,
        reason: JUSTIFICATION,
        actor: { userId: example.pmId }
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('refuses a zero or negative write-off', async () => {
    const example = await seedWorkedExample()
    await classifyAndPost({ standupId: example.day4, actor: { userId: example.pmId } })

    for (const value of [0, -60]) {
      await expect(
        writeOffDebt({
          sprintId: example.sprintId,
          memberId: example.kasunId,
          standupId: example.day4,
          minutes: value,
          reason: JUSTIFICATION,
          actor: { userId: example.pmId }
        })
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    }
  })

  it('records the write-off in the audit trail', async () => {
    const example = await seedWorkedExample()
    await seedProject(example)
    await classifyAndPost({ standupId: example.day4, actor: { userId: example.pmId } })
    await writeOffDebt({
      sprintId: example.sprintId,
      memberId: example.kasunId,
      standupId: example.day4,
      minutes: 120,
      reason: JUSTIFICATION,
      actor: { userId: example.pmId }
    })

    const { ActivityLog } = await import('@/models/ActivityLog')
    const entry = (await ActivityLog.findOne({ action: 'debt_written_off' }).lean()) as any
    expect(entry.details.before).toMatchObject({ outstandingMinutes: 120 })
    expect(entry.details.after).toMatchObject({ outstandingMinutes: 0 })
    expect(entry.details.reason).toBe(JUSTIFICATION)
  })

  it('notifies a project admin who is not the person who did it', async () => {
    // `notificationService.createNotification` reads its own connection config,
    // so it is spied on here the way the Phase 3 notification suites do. What
    // is under test is the recipient rule, not the transport.
    const { notificationService } = await import('@/lib/notification-service')
    const createNotification = jest
      .spyOn(notificationService, 'createNotification')
      .mockResolvedValue({ _id: 'notification' } as any)

    const example = await seedWorkedExample()
    await Project.create({
      _id: example.projectId,
      name: 'Kanvaro',
      organization: ids.organization,
      // Amal created the project; Kasun's PM is doing the write-off.
      createdBy: example.amalId,
      teamMembers: [],
      status: 'active',
      projectNumber: 1,
      startDate: new Date('2026-08-01T00:00:00.000Z')
    })
    await classifyAndPost({ standupId: example.day4, actor: { userId: example.pmId } })

    await writeOffDebt({
      sprintId: example.sprintId,
      memberId: example.kasunId,
      standupId: example.day4,
      minutes: 120,
      reason: JUSTIFICATION,
      actor: { userId: example.pmId }
    })

    const recipients = createNotification.mock.calls.map((call) => call[0])
    expect(recipients).toEqual([example.amalId])
    // The person who did it does not need telling they did it.
    expect(recipients).not.toContain(example.pmId)
    expect(createNotification.mock.calls[0][2].message).toContain('Kasun Perera')
    expect(createNotification.mock.calls[0][2].message).toContain(JUSTIFICATION)

    createNotification.mockRestore()
  })

  it('refreshes the summary read model', async () => {
    const example = await seedWorkedExample()
    await seedProject(example)
    await classifyAndPost({ standupId: example.day4, actor: { userId: example.pmId } })
    await writeOffDebt({
      sprintId: example.sprintId,
      memberId: example.kasunId,
      standupId: example.day4,
      minutes: 120,
      reason: JUSTIFICATION,
      actor: { userId: example.pmId }
    })

    const summary = (await MemberSprintDebtSummary.findOne({
      sprint: example.sprintId,
      member: example.kasunId
    }).lean()) as any
    expect(summary.outstandingMinutes).toBe(0)
    expect(summary.writtenOffMinutes).toBe(120)
    expect(summary.accruedMinutes).toBe(120)
  })
})

describe('carry-in (VAR-9)', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(EstimateDebtLedger)
  })

  it('refuses when the project has it switched off', async () => {
    const example = await seedWorkedExample()
    await classifyAndPost({ standupId: example.day4, actor: { userId: example.pmId } })

    await expect(
      postCarryIn({
        fromSprintId: example.sprintId,
        toSprintId: example.sprintId,
        actor: { userId: example.pmId }
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('lists who carries what before anything is posted', async () => {
    const example = await seedWorkedExample()
    await classifyAndPost({ standupId: example.day4, actor: { userId: example.pmId } })

    const candidates = await previewCarryIn({
      fromSprintId: example.sprintId,
      toSprintId: example.sprintId
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ memberId: example.kasunId, minutes: 120 })
    expect(candidates[0].memberName).toBe('Kasun Perera')
  })

  it('omits a member whose balance is already clear', async () => {
    const example = await seedWorkedExample()
    await seedProject(example)
    await classifyAndPost({ standupId: example.day4, actor: { userId: example.pmId } })
    await writeOffDebt({
      sprintId: example.sprintId,
      memberId: example.kasunId,
      standupId: example.day4,
      minutes: 120,
      reason: JUSTIFICATION,
      actor: { userId: example.pmId }
    })

    expect(
      await previewCarryIn({ fromSprintId: example.sprintId, toSprintId: example.sprintId })
    ).toEqual([])
  })
})

describe('rebuildDebtSummaries (NFR-9)', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(EstimateDebtLedger)
  })

  it('reproduces identical summaries after the collection is dropped', async () => {
    const example = await seedWorkedExample()
    await classifyAndPost({ standupId: example.day4, actor: { userId: example.pmId } })

    const normalise = (rows: any[]) =>
      rows
        .map((row) => ({
          sprint: String(row.sprint),
          member: String(row.member),
          project: String(row.project),
          organization: String(row.organization),
          outstandingMinutes: row.outstandingMinutes,
          accruedMinutes: row.accruedMinutes,
          creditedMinutes: row.creditedMinutes,
          settledMinutes: row.settledMinutes,
          writtenOffMinutes: row.writtenOffMinutes,
          carriedInMinutes: row.carriedInMinutes,
          sourceVersion: row.sourceVersion
        }))
        .sort((a, b) => a.member.localeCompare(b.member))

    const before = normalise((await MemberSprintDebtSummary.find({}).lean()) as any[])
    expect(before).toHaveLength(1)

    await MemberSprintDebtSummary.collection.drop()

    const { rebuilt } = await rebuildDebtSummaries({})
    expect(rebuilt).toBe(1)

    const after = normalise((await MemberSprintDebtSummary.find({}).lean()) as any[])
    expect(after).toEqual(before)
  })

  it('rebuilds one sprint without touching another', async () => {
    const example = await seedWorkedExample()
    await classifyAndPost({ standupId: example.day4, actor: { userId: example.pmId } })

    const otherSprint = await Sprint.create({
      name: 'Sprint 22',
      organization: ids.organization,
      project: example.projectId,
      createdBy: example.pmId,
      status: 'planning',
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-09-05T00:00:00.000Z'),
      capacity: 0,
      teamMembers: []
    })

    const { rebuilt } = await rebuildDebtSummaries({ sprintId: String(otherSprint._id) })
    expect(rebuilt).toBe(0)
    // The first sprint's summary survives a scoped rebuild of another.
    expect(await MemberSprintDebtSummary.countDocuments({ sprint: example.sprintId })).toBe(1)
  })

  it('records no summary for a sprint whose ledger is empty', async () => {
    const example = await seedWorkedExample()
    void ProjectStandupSettings
    const { rebuilt } = await rebuildDebtSummaries({ sprintId: example.sprintId })
    expect(rebuilt).toBe(0)
    expect(await MemberSprintDebtSummary.countDocuments({})).toBe(0)
  })
})
