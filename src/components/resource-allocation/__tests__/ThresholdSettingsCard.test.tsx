/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { ThresholdSettingsCard } from '@/components/resource-allocation/ThresholdSettingsCard'

const json = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response)

let fetchMock: jest.Mock

beforeEach(() => {
  fetchMock = jest.fn((_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body))
      return json(200, { success: true, data: body })
    }
    return json(200, { success: true, data: { overAllocationThresholdPercent: 100 } })
  })
  global.fetch = fetchMock as unknown as typeof fetch
})

const input = () => screen.getByLabelText('Over-allocation threshold (%)') as HTMLInputElement

describe('ThresholdSettingsCard', () => {
  it('loads the current threshold', async () => {
    render(<ThresholdSettingsCard />)
    await waitFor(() => expect(input().value).toBe('100'))
    expect(screen.getByRole('button', { name: 'Save threshold' })).toBeDisabled()
  })

  it('refuses values outside 50–200', async () => {
    render(<ThresholdSettingsCard />)
    await waitFor(() => expect(input().value).toBe('100'))

    fireEvent.change(input(), { target: { value: '30' } })
    expect(screen.getByText('Enter a whole number between 50 and 200.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save threshold' })).toBeDisabled()
  })

  it('saves a new threshold', async () => {
    const onSaved = jest.fn()
    render(<ThresholdSettingsCard onSaved={onSaved} />)
    await waitFor(() => expect(input().value).toBe('100'))

    fireEvent.change(input(), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save threshold' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(120))
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(JSON.parse(put[1].body)).toEqual({ overAllocationThresholdPercent: 120 })
  })
})
