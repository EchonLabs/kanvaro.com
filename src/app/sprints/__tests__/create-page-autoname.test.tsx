/**
 * @jest-environment jsdom
 */
import React from 'react'
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import CreateSprintPage from '../create/page'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }))
jest.mock('@/components/layout/MainLayout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}))
jest.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'u1' }, isAuthenticated: true, isLoading: false })
}))
jest.mock('@/lib/notify', () => ({ useNotify: () => ({ error: jest.fn() }) }))

const PROJECT = { _id: 'p1', name: 'Alpha', startDate: '2026-01-01', endDate: '2026-12-31' }
const PROJECT_B = { _id: 'p2', name: 'Beta', startDate: '2026-01-01', endDate: '2026-12-31' }

// Resolves the count fetch only when the test says so, so the test controls
// exactly when the auto-namer's async result lands relative to the user typing.
let releaseCounts: Array<() => void>
let countFor: Record<string, number>
let countFails: boolean

beforeEach(() => {
  releaseCounts = []
  countFor = { p1: 2, p2: 6 }
  countFails = false
  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = String(input)
    const json = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
    if (url.includes('countOnly=true')) {
      const id = /project=([^&]+)/.exec(url)![1]
      return new Promise((resolve, reject) => {
        releaseCounts.push(() =>
          countFails ? reject(new Error('boom')) : resolve({ ok: true, json: () => Promise.resolve({ success: true, count: countFor[id] }) } as never)
        )
      })
    }
    if (/\/api\/projects\/[^/?]+/.test(url)) return json({ success: true, data: PROJECT })
    if (url.includes('/api/projects')) return json({ success: true, data: [PROJECT, PROJECT_B] })
    return json({ success: true, data: { members: [] } })
  }) as never
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

const flush = async () => { await act(async () => { releaseCounts.splice(0).forEach((r) => r()) }) }

const pickProject = (id: string) =>
  fireEvent.change(document.querySelector('select')!, { target: { value: id } })

it('still auto-names the sprint while the field is untouched, and renumbers on project change', async () => {
  render(<CreateSprintPage />)
  const name = await screen.findByPlaceholderText('Enter sprint name')
  expect(name).toHaveValue('')

  await waitFor(() => expect(document.querySelector('select option[value="p1"]')).not.toBeNull())
  pickProject('p1')
  await waitFor(() => expect(releaseCounts.length).toBe(1))
  await flush()
  await waitFor(() => expect(name).toHaveValue('Sprint 3'))

  pickProject('p2')
  await waitFor(() => expect(releaseCounts.length).toBe(1))
  await flush()
  await waitFor(() => expect(name).toHaveValue('Sprint 7'))
})

it('does not overwrite a name the user typed while the count fetch was in flight', async () => {
  render(<CreateSprintPage />)
  const name = await screen.findByPlaceholderText('Enter sprint name')
  await waitFor(() => expect(document.querySelector('select option[value="p1"]')).not.toBeNull())

  pickProject('p1')
  await waitFor(() => expect(releaseCounts.length).toBe(1))
  fireEvent.change(name, { target: { value: 'E2E Sprint 1' } })
  await flush()

  expect(name).toHaveValue('E2E Sprint 1')
})

it('does not overwrite a name typed before the project was chosen', async () => {
  render(<CreateSprintPage />)
  const name = await screen.findByPlaceholderText('Enter sprint name')
  await waitFor(() => expect(document.querySelector('select option[value="p1"]')).not.toBeNull())

  fireEvent.change(name, { target: { value: 'Hardening Sprint' } })
  pickProject('p1')
  await waitFor(() => expect(releaseCounts.length).toBe(1))
  await flush()

  expect(name).toHaveValue('Hardening Sprint')
})

it('does not overwrite a typed name when the count fetch fails (catch fallback)', async () => {
  countFails = true
  render(<CreateSprintPage />)
  const name = await screen.findByPlaceholderText('Enter sprint name')
  await waitFor(() => expect(document.querySelector('select option[value="p1"]')).not.toBeNull())

  pickProject('p1')
  await waitFor(() => expect(releaseCounts.length).toBe(1))
  fireEvent.change(name, { target: { value: 'Mine' } })
  await flush()

  expect(name).toHaveValue('Mine')
})
