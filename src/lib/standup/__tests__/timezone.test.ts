import { formatDualTimezone } from '../timezone'

describe('formatDualTimezone', () => {
  it('shows the viewer time with the project time alongside when they differ', () => {
    const result = formatDualTimezone({
      instant: new Date('2026-09-05T09:00:00Z'),
      viewerTimeZone: 'America/New_York',
      projectTimeZone: 'Asia/Colombo'
    })
    // 09:00 UTC = 05:00 EDT = 14:30 +05:30
    expect(result).toContain('05:00')
    expect(result).toContain('14:30')
    expect(result).toMatch(/project time/i)
  })

  it('shows just one time when the viewer and project share a timezone', () => {
    const result = formatDualTimezone({
      instant: new Date('2026-09-05T09:00:00Z'),
      viewerTimeZone: 'Asia/Colombo',
      projectTimeZone: 'Asia/Colombo'
    })
    expect(result).not.toMatch(/project time/i)
  })
})
