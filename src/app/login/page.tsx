'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useOrganization } from '@/hooks/useOrganization'
import { Eye, EyeOff, Loader2, ArrowRight, X, CheckCircle2 } from 'lucide-react'
import { getAppVersion } from '@/lib/version'

/* Shared input style — full pill */
const inputBase =
  'w-full h-[46px] rounded-full border border-black/[0.09] dark:border-white/[0.10] bg-black/[0.04] dark:bg-white/[0.06] px-5 text-[15px] tracking-[-0.1px] text-[var(--apple-label)] placeholder:text-[var(--apple-tertiary-label)] outline-none focus:ring-2 focus:ring-[#3FADA5]/30 focus:border-[#3FADA5]/60 apple-transition disabled:opacity-50 disabled:cursor-not-allowed'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const { organization } = useOrganization()

  useEffect(() => {
    const message = searchParams.get('message')
    const errorParam = searchParams.get('error')
    const success = searchParams.get('success')

    if (message === 'setup-completed') {
      setSuccessMessage('Setup completed! Please sign in with your admin credentials.')
    } else if (success) {
      setSuccessMessage(success)
    } else if (errorParam) {
      setError(errorParam)
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setIsLoading(false)
        setIsLoadingPermissions(true)

        try {
          const returnTo = searchParams.get('returnTo')
          const redirectTarget =
            returnTo && returnTo.startsWith('/') && !returnTo.startsWith('/login')
              ? decodeURIComponent(returnTo)
              : '/dashboard'

          // Hard navigation — forces browser to send the new HTTP-only cookies
          setTimeout(() => { window.location.href = redirectTarget }, 100)
        } catch (err) {
          console.error('Redirect error:', err)
          setError('An error occurred. Please try again.')
          setIsLoadingPermissions(false)
        }
      } else {
        setError(data.error || 'Login failed. Please try again.')
        setIsLoading(false)
      }
    } catch {
      setError('Login failed. Please check your connection and try again.')
      setIsLoading(false)
      setIsLoadingPermissions(false)
    }
  }

  const busy = isLoading || isLoadingPermissions

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden">
      {/* ── Aurora background ── */}
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
      {/* Subtle dot grid */}
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
          {/* Inner top highlight */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent" />

          <div className="p-8 space-y-6">
            {/* Heading */}
            <div className="text-center">
              <h1 className="text-[26px] font-bold tracking-[-0.5px] text-[var(--apple-label)]">
                Welcome back
              </h1>
              <p className="text-[14px] text-[var(--apple-secondary-label)] mt-1">
                Sign in to {organization?.name || 'Kanvaro'}
              </p>
            </div>

            {/* Banners */}
            {successMessage && (
              <div className="flex items-center gap-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/50 px-4 py-3 text-[13px] text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span className="flex-1">{successMessage}</span>
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200/80 dark:border-red-800/50 px-4 py-3 text-[13px] text-red-600 dark:text-red-400">
                <span className="flex-1">{error}</span>
                <button type="button" onClick={() => setError('')} className="shrink-0 apple-transition hover:opacity-60">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-[12px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-secondary-label)] mb-2 pl-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  disabled={busy}
                  className={inputBase}
                />
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-2 pl-1">
                  <label htmlFor="password" className="text-[12px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-secondary-label)]">
                    Password
                  </label>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => router.push('/forgot-password')}
                    disabled={busy}
                    className="text-[12px] font-medium text-[var(--apple-system-blue)] hover:opacity-70 apple-transition pr-1"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    disabled={busy}
                    className={`${inputBase} pr-14`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={busy}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--apple-tertiary-label)] hover:text-[var(--apple-secondary-label)] apple-transition"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Sign In — gradient pill */}
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full h-[52px] rounded-full text-white font-semibold text-[15px] tracking-[-0.1px] flex items-center justify-center gap-2 apple-transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                  style={{ background: 'linear-gradient(135deg, #3FADA5 0%, #244E9B 100%)' }}
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {isLoadingPermissions ? 'Preparing your workspace…' : 'Signing in…'}
                    </>
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-7 text-center space-y-2">
          <p className="text-[12px] text-[var(--apple-tertiary-label)]">
            Need help?{' '}
            <a
              href="/docs/public"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--apple-system-blue)] hover:opacity-70 apple-transition"
            >
              View documentation
            </a>
          </p>
          <p className="text-[11px] text-[var(--apple-quaternary-label)] font-apple-mono">
            v{getAppVersion()}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F4F4F6] dark:bg-[#06060A] flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-[#3FADA5]" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
