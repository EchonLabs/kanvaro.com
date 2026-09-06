// src/lib/standup/__tests__/sprint-close-service.integration.test.ts
//
// Uses this suite's shared `useMongo()`/`ids` harness (`./helpers/mongo`),
// the same one every sibling stand-up integration test uses — never a private
// `MongoMemoryServer` (see `jest.global-setup.js`'s doc comment on why that
// was removed). `loadCapacityContext` — which both `loadSprintCloseReadiness`
// and `setTaskDisposition` go through — never queries `Project` or `Sprint`
// documents (it reads `Standup`, `ProjectStandupSettings`, `MemberCapacity`,
// `WorkingCalendar` via `loadCalendarContext`, and debt positions), so this
// fixture does not create either; `Standup.sprint`/`Standup.project` are bare
// ObjectId references, matching the pattern `jobs.send-reminders.test.ts`
// already uses for its own `Sprint`-light seeding.
import { Task } from '@/models/Task'
import { Standup } from '@/models/Standup'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { WorkingCalendar } from '@/models/WorkingCalendar'
import { loadSprintCloseReadiness, setTaskDisposition } from '../sprint-close-service'
import { anyId, ids, useMongo } from './helpers/mongo'

const { organization, project, sprint, member: pm } = ids

async function seed() {
  await WorkingCalendar.create({
    scope: 'project',
    organization,
    project,
    workingDaysOfWeek: [1, 2, 3, 4, 5],
    standardMinutesPerDay: 480,
    timezone: 'Asia/Colombo',
    subscribedHolidaySets: [],
    overrides: []
  })
  await ProjectStandupSettings.create({
    project,
    organization,
    enabled: true,
    standupLocalTime: '09:00',
    defaultFacilitator: pm
  })

  const standup = await Standup.create({
    project,
    sprint,
    organization,
    standupDate: '2026-09-05',
    scheduledStartAt: new Date('2026-09-05T03:30:00Z'),
    durationMinutes: 15,
    sprintDayNumber: 5,
    totalSprintDays: 5,
    shape: 'final_day',
    status: 'In_Progress',
    facilitator: pm,
    expectedAttendees: [pm]
  })

  const openTask = await Task.create({
    title: 'Open task',
    description: '',
    status: 'in_progress',
    priority: 'medium',
    type: 'task',
    organization,
    project,
    sprint,
    taskNumber: 1,
    displayId: 'KAN-1',
    createdBy: pm,
    remainingEstimateMinutes: 120,
    labels: [],
    dependencies: [],
    attachments: []
  })

  return { standup, openTask }
}

describe('loadSprintCloseReadiness', () => {
  useMongo()

  it('lists an open task with no disposition as a failure', async () => {
    const { standup, openTask } = await seed()

    const view = await loadSprintCloseReadiness(String(standup._id))

    expect(view.shape).toBe('final_day')
    expect(view.openTasks.map((t) => t.taskId)).toContain(String(openTask._id))
    expect(view.taskFailures).toBe(1)
  })

  it('excludes a task once it is dispositioned', async () => {
    const { standup, openTask } = await seed()

    await setTaskDisposition({
      standupId: String(standup._id),
      taskId: String(openTask._id),
      type: 'move_to_next_sprint',
      actor: { userId: String(pm) }
    })

    const view = await loadSprintCloseReadiness(String(standup._id))
    const row = view.openTasks.find((t) => t.taskId === String(openTask._id))
    expect(row?.disposition).toBe('move_to_next_sprint')
    expect(view.taskFailures).toBe(0)
  })

  it('excludes a done task from the open list entirely', async () => {
    const { standup } = await seed()
    await Task.create({
      title: 'Done task',
      description: '',
      status: 'done',
      priority: 'medium',
      type: 'task',
      organization,
      project,
      sprint,
      taskNumber: 2,
      displayId: 'KAN-2',
      createdBy: pm,
      remainingEstimateMinutes: 0,
      labels: [],
      dependencies: [],
      attachments: []
    })

    const view = await loadSprintCloseReadiness(String(standup._id))
    expect(view.openTasks.map((t) => t.taskKey)).not.toContain('KAN-2')
  })

  it('rejects a disposition for a task outside the stand-up’s sprint', async () => {
    const { standup } = await seed()
    const foreignTask = await Task.create({
      title: 'Elsewhere',
      description: '',
      status: 'in_progress',
      priority: 'medium',
      type: 'task',
      organization,
      project,
      sprint: anyId(),
      taskNumber: 3,
      displayId: 'KAN-3',
      createdBy: pm,
      remainingEstimateMinutes: 60,
      labels: [],
      dependencies: [],
      attachments: []
    })

    await expect(
      setTaskDisposition({
        standupId: String(standup._id),
        taskId: String(foreignTask._id),
        type: 'descope',
        actor: { userId: String(pm) }
      })
    ).rejects.toThrow()
  })
})
