'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, Check, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'
import { getAppVersion } from '@/lib/version'

function buildLoginRedirectUrl(authorizePathWithSearch: string): string {
  return `/login?returnTo=${encodeURIComponent(authorizePathWithSearch)}`
}

interface ConsentData {
  client: {
    id: string
    name: string
  }
  user: {
    email: string
    firstName?: string
    lastName?: string
  }
  resource: string
}

function formatResourceHost(resource: string): string {
  try {
    return new URL(resource).host
  } catch {
    return resource
  }
}

function OAuthAuthorizeContent() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'validating' | 'consent' | 'redirecting' | 'error'>(
    'validating'
  )
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [consentData, setConsentData] = useState<ConsentData | null>(null)
  const [submitting, setSubmitting] = useState<boolean>(false)

  const collectQueryParams = () => ({
    client_id: searchParams.get('client_id'),
    redirect_uri: searchParams.get('redirect_uri'),
    response_type: searchParams.get('response_type'),
    code_challenge: searchParams.get('code_challenge'),
    code_challenge_method: searchParams.get('code_challenge_method'),
    state: searchParams.get('state'),
    resource: searchParams.get('resource'),
    scope: searchParams.get('scope'),
  })

  useEffect(() => {
    let cancelled = false

    async function checkAuthorization() {
      try {
        const response = await fetch('/api/oauth/authorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'check',
            ...collectQueryParams(),
          }),
        })

        const data = await response.json().catch(() => ({}))
        if (cancelled) return

        if (response.status === 400 || data.validParams === false) {
          if (typeof data.redirectUrl === 'string') {
            try {
              const parsed = new URL(data.redirectUrl)
              const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
              if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && isLoopback) {
                setStatus('redirecting')
                window.location.href = data.redirectUrl
                return
              }
            } catch {
              // Fall through to showing error page
            }
          }
          setErrorMessage(data.error || 'Invalid authorization request parameters.')
          setStatus('error')
          return
        }

        if (response.status === 401 || data.authenticated === false) {
          const currentPathWithQuery = `${window.location.pathname}${window.location.search}`
          window.location.href = buildLoginRedirectUrl(currentPathWithQuery)
          return
        }

        if (!response.ok || !data.client || !data.user || !data.resource) {
          setErrorMessage(data.error || 'Unable to verify authorization request.')
          setStatus('error')
          return
        }

        setConsentData({
          client: data.client,
          user: data.user,
          resource: data.resource,
        })
        setStatus('consent')
      } catch {
        if (!cancelled) {
          setErrorMessage('Network error while verifying authorization request.')
          setStatus('error')
        }
      }
    }

    checkAuthorization()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const handleDecision = async (action: 'approve' | 'deny') => {
    if (submitting) return
    setSubmitting(true)

    try {
      const response = await fetch('/api/oauth/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ...collectQueryParams(),
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (response.status === 401 || data.authenticated === false) {
        const currentPathWithQuery = `${window.location.pathname}${window.location.search}`
        window.location.href = buildLoginRedirectUrl(currentPathWithQuery)
        return
      }

      if (!response.ok || !data.redirectUrl) {
        setErrorMessage(data.error || 'Unable to complete authorization.')
        setStatus('error')
        setSubmitting(false)
        return
      }

      // Defense-in-depth: Ensure the returned redirectUrl is strictly a valid loopback URI
      let isSafeRedirect = false
      try {
        const parsed = new URL(data.redirectUrl)
        const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
        if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && isLoopback) {
          isSafeRedirect = true
        }
      } catch {
        isSafeRedirect = false
      }

      if (!isSafeRedirect) {
        setErrorMessage('Unsafe redirect destination received.')
        setStatus('error')
        setSubmitting(false)
        return
      }

      setStatus('redirecting')
      window.location.href = data.redirectUrl
    } catch {
      setErrorMessage('Network error while submitting authorization decision.')
      setStatus('error')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden">
      {/* Aurora background matching /login */}
      <div className="fixed inset-0 -z-20 bg-[#F4F4F6] dark:bg-[#06060A]" />
      <div
        className="fixed inset-0 -z-10"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 70% 70% at 10% 10%, rgba(63,173,165,0.22) 0%, transparent 55%),
            radial-gradient(ellipse 65% 65% at 90% 85%, rgba(36,78,155,0.22) 0%, transparent 55%),
            radial-gradient(ellipse 45% 50% at 55% 25%, rgba(63,173,165,0.09) 0%, transparent 50%)
          `,
        }}
      />
      <div
        className="fixed inset-0 -z-10 opacity-[0.35] dark:opacity-[0.18]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40' width='40' height='40'%3e%3ccircle cx='1' cy='1' r='1' fill='%23000'/%3e%3c/svg%3e")`,
        }}
      />

      <div className="w-full max-w-[460px]">
        {/* Logo */}
        <div className="flex justify-center mb-9">
          <img
            src="/Kanvaro.svg"
            alt="Kanvaro"
            className="h-8 dark:brightness-0 dark:invert select-none"
            draggable={false}
          />
        </div>

        {/* Glass card */}
        <div className="auth-glass-card relative rounded-[28px] border border-white/70 dark:border-white/[0.08] overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent" />

          <div className="p-8 space-y-6 text-center">
            {status === 'validating' && (
              <>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#3FADA5]/15 text-[#3FADA5]">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
                <div className="space-y-2">
                  <h1 className="text-[22px] font-bold tracking-[-0.4px] text-[var(--apple-label)]">
                    Verifying Authorization
                  </h1>
                  <p className="text-[14px] text-[var(--apple-secondary-label)]">
                    Checking your Kanvaro session…
                  </p>
                </div>
              </>
            )}

            {status === 'consent' && consentData && (
              <div className="space-y-6 text-left">
                <div className="text-center space-y-2">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#3FADA5]/15 text-[#3FADA5]">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <h1 className="text-[22px] font-bold tracking-[-0.4px] text-[var(--apple-label)]">
                    Allow {consentData.client.name} to access Kanvaro?
                  </h1>
                  <p className="text-[13px] text-[var(--apple-secondary-label)]">
                    Signed in as{' '}
                    <span className="font-medium text-[var(--apple-label)]">
                      {consentData.user.email}
                    </span>
                  </p>
                </div>

                <div className="rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] p-4 space-y-3">
                  <ul className="space-y-2.5 text-[13px] text-[var(--apple-label)]">
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 shrink-0 text-[#3FADA5] mt-0.5" />
                      <span>Read and update your projects, tasks, sprints and time entries</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 shrink-0 text-[#3FADA5] mt-0.5" />
                      <span>Uses your existing Kanvaro permissions — nothing more</span>
                    </li>
                  </ul>
                  <p className="text-[11px] text-[var(--apple-tertiary-label)] pt-1 border-t border-black/[0.06] dark:border-white/[0.08]">
                    Server: {formatResourceHost(consentData.resource)}
                  </p>
                </div>

                <div className="flex flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleDecision('approve')}
                    disabled={submitting}
                    className="w-full h-[48px] rounded-full text-white font-semibold text-[15px] tracking-[-0.1px] flex items-center justify-center gap-2 apple-transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(135deg, #3FADA5 0%, #244E9B 100%)' }}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Authorizing…
                      </>
                    ) : (
                      'Allow'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDecision('deny')}
                    disabled={submitting}
                    className="w-full h-[44px] rounded-full border border-black/[0.10] dark:border-white/[0.12] bg-black/[0.03] dark:bg-white/[0.05] text-[14px] font-medium text-[var(--apple-label)] apple-transition hover:bg-black/[0.06] dark:hover:bg-white/[0.09] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Deny
                  </button>
                </div>
              </div>
            )}

            {status === 'redirecting' && (
              <>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div className="space-y-2">
                  <h1 className="text-[22px] font-bold tracking-[-0.4px] text-[var(--apple-label)]">
                    Returning to {consentData?.client.name || 'application'}
                  </h1>
                  <p className="text-[14px] text-[var(--apple-secondary-label)]">
                    Redirecting you back…
                  </p>
                </div>
              </>
            )}

            {status === 'error' && (
              <>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div className="space-y-2">
                  <h1 className="text-[22px] font-bold tracking-[-0.4px] text-[var(--apple-label)]">
                    Authorization Request Invalid
                  </h1>
                  <p className="text-[14px] text-[var(--apple-secondary-label)]">
                    Kanvaro could not process this sign-in request. For your security, you have not
                    been redirected.
                  </p>
                </div>

                <div className="rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200/80 dark:border-red-800/50 px-4 py-3 text-[13px] text-red-600 dark:text-red-400 text-left">
                  <p className="font-medium">{errorMessage}</p>
                </div>

                <div className="pt-2 flex items-center justify-center gap-2 text-[12px] text-[var(--apple-tertiary-label)]">
                  <ShieldCheck className="h-4 w-4 text-[#3FADA5]" />
                  <span>Protected by Kanvaro OAuth Guard</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-7 text-center">
          <p className="text-[11px] text-[var(--apple-quaternary-label)] font-apple-mono">
            v{getAppVersion()}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function OAuthAuthorizePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F4F4F6] dark:bg-[#06060A] flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-[#3FADA5]" />
        </div>
      }
    >
      <OAuthAuthorizeContent />
    </Suspense>
  )
}
