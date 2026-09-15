/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { HolidaySetManager } from '../HolidaySetManager'
import { ToastProvider } from '@/components/ui/Toast'

function createFetchMock() {
  return jest.fn((url: string) => {
    const urlStr = String(url)
    // API key status — checked before the general holiday-sets branch below,
    // since that branch's `/holiday-sets` substring match would otherwise
    // swallow this more specific path.
    if (urlStr.includes('/holiday-sets/api-key')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { hasApiKey: false } })
      })
    }
    // Refresh endpoint
    if (urlStr.includes('/holiday-sets/refresh')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: { setId: 'set1', fetched: 2, inserted: 2, updated: 0, skippedRevoked: 0 }
        })
      })
    }
    // List all holiday sets
    if (urlStr.includes('/holiday-sets') && !urlStr.includes('/holidays')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: {
            holidaySets: [{ id: 'set1', name: 'Test Set', count: 1, countryCode: 'US' }]
          }
        })
      })
    }
    // List all holidays in a set (but not revoke endpoint)
    if (urlStr.includes('/holiday-sets/set1/holidays') && !urlStr.includes('/revoke')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: {
            holidays: [
              {
                id: 'h1',
                name: 'Test Holiday',
                date: '2026-12-25',
                type: 'public',
                isFullDay: true,
                status: 'active'
              }
            ]
          }
        })
      })
    }
    // Revoke endpoint
    if (urlStr.includes('/revoke')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { success: true } })
      })
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ data: { sets: [], holidays: [] } })
    })
  })
}

describe('HolidaySetManager revoke flow', () => {
  it('does not call the revoke API when the prompt reason is shorter than 20 characters', async () => {
    const fetchMock = createFetchMock()
    global.fetch = fetchMock as any
    const promptMock = jest.fn().mockReturnValue('too short')
    window.prompt = promptMock

    render(
      <ToastProvider>
        <HolidaySetManager />
      </ToastProvider>
    )

    // Wait for holidays to load. The holiday's name lives in the tile's
    // `title` tooltip now, not as visible text, so wait on the accessible
    // withdraw button instead.
    await waitFor(
      () => {
        expect(screen.queryByRole('button', { name: /withdraw test holiday/i })).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    // Holidays render as calendar-square tiles now, not table rows — the
    // holiday's name lives in the tile's `title` tooltip rather than as
    // visible text, so find the tile via its accessible withdraw button.
    const withdrawButton = screen.getByRole('button', { name: /withdraw test holiday/i })

    fireEvent.click(withdrawButton)

    // Wait for prompt and async state changes
    await new Promise((r) => setTimeout(r, 200))

    // The guard should prevent the fetch from being made
    const revokeCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/revoke')
    )
    expect(revokeCalls).toHaveLength(0)
  })

  it('calls the revoke API when the prompt reason is 20 characters or longer', async () => {
    const fetchMock = createFetchMock()
    global.fetch = fetchMock as any
    window.prompt = jest.fn().mockReturnValue('This is a reason that is long enough')

    render(
      <ToastProvider>
        <HolidaySetManager />
      </ToastProvider>
    )

    // Wait for holidays to load. The holiday's name lives in the tile's
    // `title` tooltip now, not as visible text, so wait on the accessible
    // withdraw button instead.
    await waitFor(
      () => {
        expect(screen.queryByRole('button', { name: /withdraw test holiday/i })).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    // Find and click the withdraw button
    const withdrawButton = screen.getByRole('button', { name: /withdraw test holiday/i })

    await React.act(async () => {
      fireEvent.click(withdrawButton)
      // Give time for the async revokeHoliday function to execute
      await new Promise((resolve) => setTimeout(resolve, 300))
    })

    // Verify the revoke API call was made
    const revokeCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/revoke')
    )
    expect(revokeCalls).toHaveLength(1)
  })
})

describe('HolidaySetManager API refresh', () => {
  it('calls the refresh endpoint when "Refresh from API" is clicked', async () => {
    const fetchMock = createFetchMock()
    global.fetch = fetchMock as any

    render(
      <ToastProvider>
        <HolidaySetManager />
      </ToastProvider>
    )

    const refreshButton = await screen.findByRole('button', { name: /refresh from api/i })

    await React.act(async () => {
      fireEvent.click(refreshButton)
      await new Promise((resolve) => setTimeout(resolve, 200))
    })

    const refreshCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/holiday-sets/refresh')
    )
    expect(refreshCalls).toHaveLength(1)
  })

  it('calls the API-key endpoint when a key is saved', async () => {
    const fetchMock = createFetchMock()
    global.fetch = fetchMock as any

    render(
      <ToastProvider>
        <HolidaySetManager />
      </ToastProvider>
    )

    const keyInput = await screen.findByLabelText(/induwara\.lk api key/i)
    fireEvent.change(keyInput, { target: { value: 'secret-key-123' } })

    const saveButton = screen.getByRole('button', { name: /save key/i })

    await React.act(async () => {
      fireEvent.click(saveButton)
      await new Promise((resolve) => setTimeout(resolve, 200))
    })

    const keyCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/holiday-sets/api-key')
    )
    // One GET on mount, one PUT on save.
    expect(keyCalls.length).toBeGreaterThanOrEqual(2)
  })
})
