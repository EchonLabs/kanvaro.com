'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PasswordStrength } from '@/components/ui/PasswordStrength'
import { Loader2, CheckCircle2, Eye, EyeOff, ArrowRight, X, Sparkles } from 'lucide-react'

interface InvitationData {
  email: string
  role: string
  customRole?: string
  roleDisplayName?: string
  organization: string
  invitedBy: string
}

interface FieldErrors {
  firstName?: string
  lastName?: string
  password?: string
  confirmPassword?: string
}

interface TouchedFields {
  firstName: boolean
  lastName: boolean
  password: boolean
  confirmPassword: boolean
}

const inputBase =
  'w-full h-[46px] rounded-full border border-black/[0.09] dark:border-white/[0.10] bg-black/[0.04] dark:bg-white/[0.06] px-5 text-[15px] tracking-[-0.1px] text-[var(--apple-label)] placeholder:text-[var(--apple-tertiary-label)] outline-none focus:ring-2 focus:ring-[#3FADA5]/30 focus:border-[#3FADA5]/60 apple-transition disabled:opacity-50 disabled:cursor-not-allowed'

const inputError = 'border-red-400/70 focus:ring-red-400/20 focus:border-red-400/60'

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

const GlassCard = ({ children }: { children: React.ReactNode }) => (
  <div className="auth-glass-card relative rounded-[28px] border border-white/70 dark:border-white/[0.08] overflow-hidden">
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent" />
    {children}
  </div>
)

function PasswordReqItem({ label, met }: { label: string; met: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className={`h-4 w-4 rounded-full flex items-center justify-center shrink-0 apple-transition ${met ? 'bg-emerald-500 text-white' : 'border border-black/[0.12] dark:border-white/[0.15]'}`}>
        {met && (
          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 10 10">
            <path d="M1.5 5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className={met ? 'text-[var(--apple-label)]' : 'text-[var(--apple-tertiary-label)]'}>{label}</span>
    </div>
  )
}

function AcceptInvitationContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [invitationData, setInvitationData] = useState<InvitationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({ firstName: '', lastName: '', password: '', confirmPassword: '' })
  const [touched, setTouched] = useState<TouchedFields>({ firstName: false, lastName: false, password: false, confirmPassword: false })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  useEffect(() => {
    if (token) validateInvitation()
    else { setError('Invalid invitation link'); setLoading(false) }
  }, [token])

  useEffect(() => {
    if (touched.confirmPassword && formData.confirmPassword) {
      setFieldErrors(prev => ({ ...prev, confirmPassword: validateField('confirmPassword', formData.confirmPassword, formData.password) }))
    }
  }, [formData.password, formData.confirmPassword, touched.confirmPassword])

  const validateInvitation = async () => {
    try {
      const res = await fetch(`/api/members/validate-invitation?token=${token}`)
      const data = await res.json()
      if (data.success) {
        setInvitationData(data.data)
        setFormData(prev => ({ ...prev, firstName: data.data.firstName || '', lastName: data.data.lastName || '' }))
      } else {
        setError(data.error || 'Invalid invitation')
      }
    } catch { setError('Failed to validate invitation') }
    finally { setLoading(false) }
  }

  const validateField = (name: keyof typeof formData, value: string, currentPassword?: string): string | undefined => {
    switch (name) {
      case 'firstName': return !value.trim() ? 'Required' : value.trim().length < 2 ? 'At least 2 characters' : undefined
      case 'lastName': return !value.trim() ? 'Required' : value.trim().length < 2 ? 'At least 2 characters' : undefined
      case 'password':
        if (!value) return 'Required'
        if (value.length < 8) return 'At least 8 characters'
        if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value) || !/[!@#$%^&*(),.?":{}|<>]/.test(value))
          return 'Must include uppercase, lowercase, number & special character'
        return undefined
      case 'confirmPassword': {
        if (!value) return 'Required'
        const cmp = currentPassword !== undefined ? currentPassword : formData.password
        return value !== cmp ? "Passwords don't match" : undefined
      }
      default: return undefined
    }
  }

  const validateForm = () => {
    const errors: FieldErrors = {
      firstName: validateField('firstName', formData.firstName),
      lastName: validateField('lastName', formData.lastName),
      password: validateField('password', formData.password),
      confirmPassword: validateField('confirmPassword', formData.confirmPassword),
    }
    setFieldErrors(errors)
    return !errors.firstName && !errors.lastName && !errors.password && !errors.confirmPassword
  }

  const isFormValid = () =>
    formData.firstName.trim().length >= 2 &&
    formData.lastName.trim().length >= 2 &&
    formData.password.length >= 8 &&
    formData.password === formData.confirmPassword &&
    /[a-z]/.test(formData.password) &&
    /[A-Z]/.test(formData.password) &&
    /\d/.test(formData.password) &&
    /[!@#$%^&*(),.?":{}|<>]/.test(formData.password)

  const handleChange = (name: keyof typeof formData, value: string) => {
    if (error) setError('')
    setFormData(prev => ({ ...prev, [name]: value }))
    if (touched[name]) {
      setFieldErrors(prev => ({ ...prev, [name]: validateField(name, value, name === 'password' ? value : formData.password) }))
    }
  }

  const handleBlur = (name: keyof typeof formData) => {
    setTouched(prev => ({ ...prev, [name]: true }))
    setFieldErrors(prev => ({ ...prev, [name]: validateField(name, formData[name]) }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setTouched({ firstName: true, lastName: true, password: true, confirmPassword: true })
    if (!validateForm()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/members/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, firstName: formData.firstName, lastName: formData.lastName, password: formData.password }),
      })
      const data = await res.json()
      if (data.success) setSuccess(true)
      else setError(data.error || 'Failed to accept invitation')
    } catch { setError('Failed to accept invitation') }
    finally { setSubmitting(false) }
  }

  const roleLabel =
    invitationData?.roleDisplayName ||
    invitationData?.role?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) ||
    'Member'

  const pw = formData.password

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F4F6] dark:bg-[#06060A] flex items-center justify-center">
        <div className="flex items-center gap-2.5 text-[var(--apple-secondary-label)]">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: '#3FADA5' }} />
          <span className="text-[15px]">Validating invitation…</span>
        </div>
      </div>
    )
  }

  /* ── Success ── */
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden">
        {BG}
        <div className="w-full max-w-[480px]">
          <div className="flex justify-center mb-9">
            <img src="/Kanvaro.svg" alt="Kanvaro" className="h-8 dark:brightness-0 dark:invert select-none" draggable={false} />
          </div>
          <GlassCard>
            <div className="p-10 text-center space-y-5">
              <div
                className="h-[72px] w-[72px] rounded-[22px] flex items-center justify-center mx-auto shadow-[0_8px_32px_rgba(52,199,89,0.28)]"
                style={{ background: 'linear-gradient(135deg, rgba(52,199,89,0.15) 0%, rgba(52,199,89,0.08) 100%)', border: '1px solid rgba(52,199,89,0.20)' }}
              >
                <CheckCircle2 className="h-9 w-9 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-[24px] font-bold tracking-[-0.4px] text-[var(--apple-label)]">You're all set!</h2>
                <p className="text-[14px] text-[var(--apple-secondary-label)] mt-2">
                  Your account has been created. You can now sign in to{' '}
                  <span className="font-medium text-[var(--apple-label)]">{invitationData?.organization || 'Kanvaro'}</span>.
                </p>
              </div>
              <button
                onClick={() => router.push('/login')}
                className="w-full h-[52px] rounded-full text-white font-semibold text-[15px] tracking-[-0.1px] flex items-center justify-center gap-2 apple-transition hover:opacity-90 active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #3FADA5 0%, #244E9B 100%)' }}
              >
                Sign In
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </GlassCard>
        </div>
      </div>
    )
  }

  /* ── Invalid invitation ── */
  if (error && !invitationData) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden">
        {BG}
        <div className="w-full max-w-[480px]">
          <div className="flex justify-center mb-9">
            <img src="/Kanvaro.svg" alt="Kanvaro" className="h-8 dark:brightness-0 dark:invert select-none" draggable={false} />
          </div>
          <GlassCard>
            <div className="p-10 text-center space-y-4">
              <h2 className="text-[22px] font-bold tracking-[-0.4px] text-[var(--apple-label)]">Invalid Invitation</h2>
              <p className="text-[14px] text-[var(--apple-secondary-label)]">{error}</p>
              <button
                onClick={() => router.push('/login')}
                className="inline-flex items-center gap-2 h-[48px] px-7 rounded-full border border-black/[0.09] dark:border-white/[0.10] text-[var(--apple-label)] font-medium text-[14px] apple-transition hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
              >
                Go to Sign In
              </button>
            </div>
          </GlassCard>
        </div>
      </div>
    )
  }

  /* ── Main form ── */
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden">
      {BG}
      <div className="w-full max-w-[480px]">
        {/* Logo */}
        <div className="flex justify-center mb-9">
          <img src="/Kanvaro.svg" alt="Kanvaro" className="h-8 dark:brightness-0 dark:invert select-none" draggable={false} />
        </div>

        {/* Icon + heading */}
        <div className="flex flex-col items-center mb-7">
          <div
            className="h-[72px] w-[72px] rounded-[22px] flex items-center justify-center mb-5 shadow-[0_8px_32px_rgba(63,173,165,0.22)]"
            style={{ background: 'linear-gradient(135deg, rgba(63,173,165,0.18) 0%, rgba(36,78,155,0.18) 100%)', border: '1px solid rgba(63,173,165,0.20)' }}
          >
            <Sparkles className="h-9 w-9" style={{ color: '#3FADA5' }} />
          </div>
          <h1 className="text-[26px] font-bold tracking-[-0.5px] text-[var(--apple-label)] text-center">
            Join {invitationData?.organization || 'Kanvaro'}
          </h1>
          <p className="text-[14px] text-[var(--apple-secondary-label)] mt-1.5 text-center">
            You've been invited as{' '}
            <span className="font-semibold" style={{ color: '#3FADA5' }}>{roleLabel}</span>
          </p>

          {/* Email badge */}
          {invitationData?.email && (
            <div className="mt-3.5 inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-black/[0.09] dark:border-white/[0.10] bg-black/[0.03] dark:bg-white/[0.05] text-[13px] font-medium text-[var(--apple-secondary-label)]">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: 'linear-gradient(135deg, #3FADA5 0%, #244E9B 100%)' }} />
              {invitationData.email}
            </div>
          )}
        </div>

        {/* Glass card */}
        <GlassCard>
          <form onSubmit={handleSubmit} className="p-8 space-y-4">
            {/* Error banner */}
            {error && (
              <div className="flex items-center gap-2.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200/80 dark:border-red-800/50 px-4 py-3 text-[13px] text-red-600 dark:text-red-400">
                <span className="flex-1">{error}</span>
                <button type="button" onClick={() => setError('')} className="shrink-0 apple-transition hover:opacity-60">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Name row — two pill inputs side by side */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="firstName" className="block text-[12px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-secondary-label)] mb-2 pl-1">
                  First name
                </label>
                <input
                  id="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => handleChange('firstName', e.target.value)}
                  onBlur={() => handleBlur('firstName')}
                  required
                  className={`${inputBase} ${touched.firstName && fieldErrors.firstName ? inputError : ''}`}
                  aria-invalid={touched.firstName && !!fieldErrors.firstName}
                />
                {touched.firstName && fieldErrors.firstName && (
                  <p className="mt-1.5 pl-3 text-[11px] text-red-500">{fieldErrors.firstName}</p>
                )}
              </div>

              <div>
                <label htmlFor="lastName" className="block text-[12px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-secondary-label)] mb-2 pl-1">
                  Last name
                </label>
                <input
                  id="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => handleChange('lastName', e.target.value)}
                  onBlur={() => handleBlur('lastName')}
                  required
                  className={`${inputBase} ${touched.lastName && fieldErrors.lastName ? inputError : ''}`}
                  aria-invalid={touched.lastName && !!fieldErrors.lastName}
                />
                {touched.lastName && fieldErrors.lastName && (
                  <p className="mt-1.5 pl-3 text-[11px] text-red-500">{fieldErrors.lastName}</p>
                )}
              </div>
            </div>

            {/* Thin separator */}
            <div className="h-px bg-black/[0.05] dark:bg-white/[0.06]" />

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-[12px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-secondary-label)] mb-2 pl-1">
                Create password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  onBlur={() => handleBlur('password')}
                  required
                  minLength={8}
                  placeholder="Create a strong password"
                  className={`${inputBase} pr-14 ${touched.password && fieldErrors.password ? inputError : ''}`}
                  aria-invalid={touched.password && !!fieldErrors.password}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--apple-tertiary-label)] hover:text-[var(--apple-secondary-label)] apple-transition"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {touched.password && fieldErrors.password && (
                <p className="mt-1.5 pl-3 text-[11px] text-red-500">{fieldErrors.password}</p>
              )}

              {/* Requirements — only show while typing */}
              {pw && (
                <div className="mt-3 rounded-2xl border border-black/[0.06] dark:border-white/[0.07] bg-black/[0.02] dark:bg-white/[0.03] px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <PasswordReqItem label="8+ characters" met={pw.length >= 8} />
                  <PasswordReqItem label="Uppercase" met={/[A-Z]/.test(pw)} />
                  <PasswordReqItem label="Lowercase" met={/[a-z]/.test(pw)} />
                  <PasswordReqItem label="Number" met={/\d/.test(pw)} />
                  <PasswordReqItem label="Special character" met={/[!@#$%^&*(),.?":{}|<>]/.test(pw)} />
                </div>
              )}

              <div className="mt-2.5">
                <PasswordStrength password={pw} />
              </div>
            </div>

            {/* Confirm password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-[12px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-secondary-label)] mb-2 pl-1">
                Confirm password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => handleChange('confirmPassword', e.target.value)}
                  onBlur={() => handleBlur('confirmPassword')}
                  required
                  minLength={8}
                  placeholder="Repeat your password"
                  className={`${inputBase} pr-14 ${touched.confirmPassword && fieldErrors.confirmPassword ? inputError : ''}`}
                  aria-invalid={touched.confirmPassword && !!fieldErrors.confirmPassword}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--apple-tertiary-label)] hover:text-[var(--apple-secondary-label)] apple-transition"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {touched.confirmPassword && fieldErrors.confirmPassword && (
                <p className="mt-1.5 pl-3 text-[11px] text-red-500">{fieldErrors.confirmPassword}</p>
              )}
            </div>

            {/* Submit — gradient pill */}
            <div className="pt-1">
              <button
                type="submit"
                disabled={submitting || !isFormValid()}
                className="w-full h-[52px] rounded-full text-white font-semibold text-[15px] tracking-[-0.1px] flex items-center justify-center gap-2 apple-transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                style={{ background: 'linear-gradient(135deg, #3FADA5 0%, #244E9B 100%)' }}
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Creating account…</>
                ) : (
                  <>Create account <ArrowRight className="h-4 w-4" /></>
                )}
              </button>
            </div>
          </form>
        </GlassCard>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="text-[13px] text-[var(--apple-tertiary-label)] hover:text-[var(--apple-secondary-label)] apple-transition"
          >
            Already have an account?{' '}
            <span className="font-medium text-[var(--apple-system-blue)]">Sign In</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AcceptInvitationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F4F4F6] dark:bg-[#06060A] flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-[#3FADA5]" />
        </div>
      }
    >
      <AcceptInvitationContent />
    </Suspense>
  )
}
