'use client'

import { useState, useRef, useEffect, KeyboardEvent, ClipboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Mail, Loader2, X, ShieldCheck, CheckCircle2, RefreshCw, ArrowRight } from 'lucide-react'

const inputBase =
  'w-full h-[46px] rounded-full border border-black/[0.09] dark:border-white/[0.10] bg-black/[0.04] dark:bg-white/[0.06] px-5 text-[15px] tracking-[-0.1px] text-[var(--apple-label)] placeholder:text-[var(--apple-tertiary-label)] outline-none focus:ring-2 focus:ring-[#3FADA5]/30 focus:border-[#3FADA5]/60 apple-transition disabled:opacity-50 disabled:cursor-not-allowed'

const BG = (
  <>
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
  </>
)

const GlassCard = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`auth-glass-card relative rounded-[28px] border border-white/70 dark:border-white/[0.08] overflow-hidden ${className}`}>
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent" />
    {children}
  </div>
)

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [isLoading, setIsLoading] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [resendCountdown, setResendCountdown] = useState(0)
  const router = useRouter()
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (resendCountdown > 0) {
      const t = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000)
      return () => clearTimeout(t)
    }
  }, [resendCountdown])

  useEffect(() => {
    if (step === 'otp') setTimeout(() => inputRefs.current[0]?.focus(), 120)
  }, [step])

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setStep('otp')
        setResendCountdown(60)
        if (data.demoOtp) alert(`Demo OTP: ${data.demoOtp}\n\nIn production this would be sent by email.`)
      } else {
        setError(data.error || 'Failed to send reset code')
      }
    } catch {
      setError('Failed to send reset code. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const otp = otpDigits.join('')
    if (otp.length !== 6) return
    setIsVerifying(true)
    setError('')
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        localStorage.setItem('resetToken', data.resetToken)
        localStorage.setItem('resetEmail', email)
        router.push('/reset-password')
      } else {
        setError(data.error || 'Invalid verification code')
        setOtpDigits(['', '', '', '', '', ''])
        inputRefs.current[0]?.focus()
      }
    } catch {
      setError('Unable to connect to server. Please try again.')
      setOtpDigits(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } finally {
      setIsVerifying(false)
    }
  }

  const handleResend = async () => {
    if (resendCountdown > 0) return
    setIsLoading(true)
    setError('')
    setOtpDigits(['', '', '', '', '', ''])
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setResendCountdown(60)
        if (data.demoOtp) alert(`Demo OTP: ${data.demoOtp}`)
      } else {
        setError(data.error || 'Failed to resend code')
      }
    } catch {
      setError('Failed to resend code. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...otpDigits]
    next[index] = digit
    setOtpDigits(next)
    if (digit && index < 5) inputRefs.current[index + 1]?.focus()
    if (digit && index === 5 && next.every(d => d !== '')) {
      setTimeout(() => { if (next.join('').length === 6) handleVerifyOtp() }, 100)
    }
  }

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus()
        const next = [...otpDigits]; next[index - 1] = ''; setOtpDigits(next)
      } else {
        const next = [...otpDigits]; next[index] = ''; setOtpDigits(next)
      }
    } else if (e.key === 'ArrowLeft' && index > 0) inputRefs.current[index - 1]?.focus()
    else if (e.key === 'ArrowRight' && index < 5) inputRefs.current[index + 1]?.focus()
  }

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const next = [...otpDigits]
    for (let i = 0; i < 6; i++) next[i] = pasted[i] || ''
    setOtpDigits(next)
    inputRefs.current[Math.min(pasted.length - 1, 5)]?.focus()
    if (pasted.length === 6) setTimeout(() => handleVerifyOtp(), 100)
  }

  const isOtpComplete = otpDigits.every(d => d !== '')

  /* ─── OTP Step ─── */
  if (step === 'otp') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden">
        {BG}
        <div className="w-full max-w-[460px]">
          {/* Logo */}
          <div className="flex justify-center mb-9">
            <img src="/Kanvaro.svg" alt="Kanvaro" className="h-8 dark:brightness-0 dark:invert select-none" draggable={false} />
          </div>

          {/* Icon badge */}
          <div className="flex justify-center mb-6">
            <div
              className="h-[72px] w-[72px] rounded-[22px] flex items-center justify-center shadow-[0_8px_32px_rgba(63,173,165,0.28)]"
              style={{ background: 'linear-gradient(135deg, rgba(63,173,165,0.18) 0%, rgba(36,78,155,0.18) 100%)', border: '1px solid rgba(63,173,165,0.20)' }}
            >
              <ShieldCheck className="h-9 w-9" style={{ color: '#3FADA5' }} />
            </div>
          </div>

          {/* Heading */}
          <div className="text-center mb-7">
            <h1 className="text-[26px] font-bold tracking-[-0.5px] text-[var(--apple-label)]">Check your email</h1>
            <p className="text-[14px] text-[var(--apple-secondary-label)] mt-1.5">
              We sent a 6-digit code to
            </p>
            <p className="text-[15px] font-semibold text-[var(--apple-label)] mt-0.5">{email}</p>
          </div>

          <GlassCard>
            <form onSubmit={handleVerifyOtp} className="p-8 space-y-6">
              {error && (
                <div className="flex items-center gap-2.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200/80 dark:border-red-800/50 px-4 py-3 text-[13px] text-red-600 dark:text-red-400">
                  <span className="flex-1">{error}</span>
                  <button type="button" onClick={() => setError('')} className="shrink-0 apple-transition hover:opacity-60">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* OTP inputs */}
              <div className="space-y-3">
                <p className="text-[12px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-secondary-label)] text-center">
                  Verification code
                </p>
                <div className="flex justify-center gap-2.5">
                  {otpDigits.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { inputRefs.current[i] = el }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      onPaste={handlePaste}
                      onFocus={(e) => e.target.select()}
                      disabled={isVerifying}
                      className={[
                        'w-11 h-[50px] text-center text-[20px] font-bold rounded-2xl',
                        'border-2 apple-transition outline-none',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        digit
                          ? 'border-[#3FADA5] bg-[rgba(63,173,165,0.06)] text-[var(--apple-label)]'
                          : 'border-black/[0.09] dark:border-white/[0.10] bg-black/[0.04] dark:bg-white/[0.06] text-[var(--apple-label)]',
                        'focus:ring-2 focus:ring-[#3FADA5]/30',
                        error ? 'border-red-400/70' : '',
                      ].join(' ')}
                      aria-label={`Digit ${i + 1}`}
                    />
                  ))}
                </div>
                <p className="text-[11px] text-[var(--apple-tertiary-label)] text-center">You can paste the full code</p>
              </div>

              {/* Verify pill button */}
              <button
                type="submit"
                disabled={isVerifying || !isOtpComplete}
                className="w-full h-[52px] rounded-full text-white font-semibold text-[15px] tracking-[-0.1px] flex items-center justify-center gap-2 apple-transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                style={{ background: 'linear-gradient(135deg, #3FADA5 0%, #244E9B 100%)' }}
              >
                {isVerifying ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</>
                ) : isOtpComplete ? (
                  <><CheckCircle2 className="h-4 w-4" /> Verify & Continue</>
                ) : (
                  'Enter all 6 digits'
                )}
              </button>
            </form>
          </GlassCard>

          {/* Resend + links */}
          <div className="mt-6 text-center space-y-3">
            <p className="text-[13px] text-[var(--apple-secondary-label)]">Didn't receive the code?</p>
            {resendCountdown > 0 ? (
              <p className="text-[13px] text-[var(--apple-tertiary-label)]">
                Resend in <span className="font-semibold" style={{ color: '#3FADA5' }}>{resendCountdown}s</span>
              </p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--apple-system-blue)] hover:opacity-70 apple-transition disabled:opacity-40"
              >
                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Resend code
              </button>
            )}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => { setStep('email'); setOtpDigits(['', '', '', '', '', '']); setError('') }}
                className="block w-full text-[12px] text-[var(--apple-tertiary-label)] hover:text-[var(--apple-secondary-label)] apple-transition"
              >
                Use a different email
              </button>
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="inline-flex items-center gap-1.5 text-[12px] text-[var(--apple-tertiary-label)] hover:text-[var(--apple-secondary-label)] apple-transition"
              >
                <ArrowLeft className="h-3 w-3" />
                Back to Sign In
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ─── Email Step ─── */
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden">
      {BG}
      <div className="w-full max-w-[420px]">
        {/* Logo */}
        <div className="flex justify-center mb-9">
          <img src="/Kanvaro.svg" alt="Kanvaro" className="h-8 dark:brightness-0 dark:invert select-none" draggable={false} />
        </div>

        {/* Icon badge */}
        <div className="flex justify-center mb-6">
          <div
            className="h-[72px] w-[72px] rounded-[22px] flex items-center justify-center shadow-[0_8px_32px_rgba(63,173,165,0.22)]"
            style={{ background: 'linear-gradient(135deg, rgba(63,173,165,0.18) 0%, rgba(36,78,155,0.18) 100%)', border: '1px solid rgba(63,173,165,0.20)' }}
          >
            <Mail className="h-9 w-9" style={{ color: '#3FADA5' }} />
          </div>
        </div>

        {/* Heading */}
        <div className="text-center mb-7">
          <h1 className="text-[26px] font-bold tracking-[-0.5px] text-[var(--apple-label)]">Reset your password</h1>
          <p className="text-[14px] text-[var(--apple-secondary-label)] mt-1.5 max-w-[300px] mx-auto">
            Enter your email and we'll send you a verification code
          </p>
        </div>

        <GlassCard>
          <form onSubmit={handleSendCode} className="p-8 space-y-5">
            {error && (
              <div className="flex items-center gap-2.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200/80 dark:border-red-800/50 px-4 py-3 text-[13px] text-red-600 dark:text-red-400">
                <span className="flex-1">{error}</span>
                <button type="button" onClick={() => setError('')} className="shrink-0 apple-transition hover:opacity-60">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-[12px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-secondary-label)] mb-2 pl-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={isLoading}
                className={inputBase}
              />
            </div>

            {/* Send Code — gradient pill */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-[52px] rounded-full text-white font-semibold text-[15px] tracking-[-0.1px] flex items-center justify-center gap-2 apple-transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
              style={{ background: 'linear-gradient(135deg, #3FADA5 0%, #244E9B 100%)' }}
            >
              {isLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Sending code…</>
              ) : (
                <>Send verification code <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </form>
        </GlassCard>

        <div className="mt-7 text-center">
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="inline-flex items-center gap-1.5 text-[13px] text-[var(--apple-tertiary-label)] hover:text-[var(--apple-secondary-label)] apple-transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Sign In
          </button>
        </div>
      </div>
    </div>
  )
}
