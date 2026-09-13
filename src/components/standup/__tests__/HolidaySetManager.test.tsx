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
