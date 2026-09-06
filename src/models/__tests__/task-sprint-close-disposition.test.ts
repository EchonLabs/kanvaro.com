// src/models/__tests__/task-sprint-close-disposition.test.ts
//
// This repo runs one shared in-memory MongoDB for the whole Jest run
// (`jest.global-setup.js`) rather than a per-file `MongoMemoryServer` — that
// used to cause parallel-worker port contention and was deliberately removed.
// Reuse the existing `useMongo()` harness from the stand-up suite rather than
// reintroducing a private server.
import mongoose from 'mongoose'
import { Task, SPRINT_CLOSE_DISPOSITION_TYPES } from '@/models/Task'
import { useMongo } from '@/lib/standup/__tests__/helpers/mongo'

describe('Task.sprintCloseDisposition', () => {
  useMongo()

  afterEach(async () => {
    await Task.deleteMany({})
  })

  it('accepts one of the four CC-8 disposition types', async () => {
    const task = await Task.create({
      title: 'Ship it',
      description: '',
      status: 'in_progress',
      priority: 'medium',
      type: 'task',
      organization: new mongoose.Types.ObjectId(),
      project: new mongoose.Types.ObjectId(),
      taskNumber: 1,
      displayId: 'KAN-1',
      createdBy: new mongoose.Types.ObjectId(),
      labels: [],
      dependencies: [],
      attachments: [],
      sprintCloseDisposition: {
        type: 'move_to_next_sprint',
        setAt: new Date(),
        setBy: new mongoose.Types.ObjectId()
      }
    })

    expect(task.sprintCloseDisposition?.type).toBe('move_to_next_sprint')
  })

  it('rejects a disposition type outside the CC-8 set', async () => {
    await expect(
      Task.create({
        title: 'Ship it',
        description: '',
        status: 'in_progress',
        priority: 'medium',
        type: 'task',
        organization: new mongoose.Types.ObjectId(),
        project: new mongoose.Types.ObjectId(),
        taskNumber: 2,
        displayId: 'KAN-2',
        createdBy: new mongoose.Types.ObjectId(),
        labels: [],
        dependencies: [],
        attachments: [],
        sprintCloseDisposition: {
          type: 'archived' as any,
          setAt: new Date(),
          setBy: new mongoose.Types.ObjectId()
        }
      })
    ).rejects.toThrow()
  })

  it('exports exactly the four dispositions CC-8 names', () => {
    expect(SPRINT_CLOSE_DISPOSITION_TYPES).toEqual([
      'finish_today',
      'descope',
      'move_to_next_sprint',
      'split_and_move_remainder'
    ])
  })
})
