import { cronSecretIsConfigured, isCronRequestAuthorised } from '@/lib/standup/jobs/auth'

const headers = (value?: string) => ({
  get: (name: string) => (name.toLowerCase() === 'authorization' ? value ?? null : null)
})

describe('isCronRequestAuthorised', () => {
  const original = process.env.CRON_SECRET

  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = original
  })

  it('allows any request when CRON_SECRET is unset (CRON-1)', () => {
    delete process.env.CRON_SECRET

    expect(isCronRequestAuthorised(headers())).toBe(true)
    expect(cronSecretIsConfigured()).toBe(false)
  })

  it('treats an empty CRON_SECRET as unset', () => {
    process.env.CRON_SECRET = '   '

    expect(isCronRequestAuthorised(headers())).toBe(true)
    expect(cronSecretIsConfigured()).toBe(false)
  })

  it('accepts a matching bearer token when the secret is set', () => {
    process.env.CRON_SECRET = 'topsecret'

    expect(isCronRequestAuthorised(headers('Bearer topsecret'))).toBe(true)
    expect(cronSecretIsConfigured()).toBe(true)
  })

  it('rejects a missing, malformed or mismatched token when the secret is set', () => {
    process.env.CRON_SECRET = 'topsecret'

    expect(isCronRequestAuthorised(headers())).toBe(false)
    expect(isCronRequestAuthorised(headers('topsecret'))).toBe(false)
    expect(isCronRequestAuthorised(headers('Bearer wrong'))).toBe(false)
    expect(isCronRequestAuthorised(headers('Bearer topsecretlonger'))).toBe(false)
  })
})
