'use client'

import { useState, useRef, useEffect, KeyboardEvent, ClipboardEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { OrganizationLogo } from '@/components/ui/OrganizationLogo'
import { useOrganization } from '@/hooks/useOrganization'
import { ArrowLeft, Shield, Loader2, X, CheckCircle2, RefreshCw } from 'lucide-react'

export default function VerifyOtpPage() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [isLoading, setIsLoading] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [error, setError] = useState('')
  const [resendCountdown, setResendCountdown] = useState(0)
  const router = useRouter()
  const { organization } = useOrganization()

  // Refs for OTP inputs
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Pre-fill email from URL params if available
  useEffect(() => {
    const emailParam = searchParams.get('email')
    if (emailParam) {
      setEmail(emailParam)
    }
  }, [searchParams])

  // Countdown timer for resend
  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [resendCountdown])

  // Auto-focus first OTP input
  useEffect(() => {
    if (inputRefs.current[0]) {
      setTimeout(() => inputRefs.current[0]?.focus(), 100)
    }
  }, [])

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    
    const otp = otpDigits.join('')
    if (otp.length !== 6 || !email) return

    setIsVerifying(true)
    setError('')

    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, otp }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // Store reset token and redirect to new password page
        localStorage.setItem('resetToken', data.resetToken)
        localStorage.setItem('resetEmail', email)
        router.push('/reset-password')
      } else {
        setError(data.error || 'Invalid verification code')
        // Clear OTP on error
        setOtpDigits(['', '', '', '', '', ''])
        inputRefs.current[0]?.focus()
      }
    } catch (error) {
      console.error('OTP verification failed:', error)
      setError('Unable to connect to server. Please check your connection and try again.')
      setOtpDigits(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } finally {
      setIsVerifying(false)
    }
  }

  const handleResendCode = async () => {
    if (resendCountdown > 0 || !email) return
    
    setIsLoading(true)
    setError('')
    setOtpDigits(['', '', '', '', '', ''])

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setResendCountdown(60)
        if (data.demoOtp) {
          alert(`Demo OTP: ${data.demoOtp}\n\nIn production, this would be sent to your email.`)
        }
      } else {
        setError(data.error || 'Failed to resend code')
      }
    } catch (error) {
      setError('Failed to resend code. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle individual digit input
  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    
    const newDigits = [...otpDigits]
    newDigits[index] = digit
    setOtpDigits(newDigits)

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    if (digit && index === 5 && newDigits.every(d => d !== '')) {
      setTimeout(() => {
        const otp = newDigits.join('')
        if (otp.length === 6) {
          handleVerifyOtp()
        }
      }, 100)
    }
  }

  // Handle keyboard navigation
  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus()
        const newDigits = [...otpDigits]
        newDigits[index - 1] = ''
        setOtpDigits(newDigits)
      } else {
        const newDigits = [...otpDigits]
        newDigits[index] = ''
        setOtpDigits(newDigits)
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  // Handle paste
  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    
    if (pastedData) {
      const newDigits = [...otpDigits]
      for (let i = 0; i < 6; i++) {
        newDigits[i] = pastedData[i] || ''
      }
      setOtpDigits(newDigits)
      
      const lastFilledIndex = Math.min(pastedData.length - 1, 5)
      inputRefs.current[lastFilledIndex]?.focus()

      if (pastedData.length === 6) {
        setTimeout(() => handleVerifyOtp(), 100)
      }
    }
  }

  const isOtpComplete = otpDigits.every(d => d !== '')

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto">
          {/* Header Section */}
          <div className="text-center mb-8">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Shield className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Verification Code
            </h1>
            <p className="text-muted-foreground">
              Enter the 6-digit code sent to your email
            </p>
          </div>

          <Card className="border-0 shadow-xl">
            <CardContent className="pt-6">
              <form onSubmit={handleVerifyOtp} className="space-y-6">
                {error && (
                  <Alert variant="destructive" className="relative animate-in slide-in-from-top-2">
                    <AlertDescription className="pr-8">{error}</AlertDescription>
                    <button
                      type="button"
                      onClick={() => setError('')}
                      className="absolute top-2 right-2 p-1 rounded-md hover:bg-destructive/20 transition-colors"
                      aria-label="Dismiss error"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </Alert>
                )}

                {/* Email Input */}
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    required
                    disabled={isVerifying}
                    className="w-full h-12"
                  />
                </div>

                {/* OTP Input Grid */}
                <div className="space-y-4">
                  <Label className="text-center block text-sm font-medium">
                    Enter verification code
                  </Label>
                  <div className="flex justify-center gap-2 sm:gap-3">
                    {otpDigits.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => { inputRefs.current[index] = el }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(index, e)}
                        onPaste={handlePaste}
                        onFocus={(e) => e.target.select()}
                        disabled={isVerifying}
                        className={`
                          w-12 h-14 sm:w-14 sm:h-16 
                          text-center text-2xl sm:text-3xl font-bold
                          rounded-xl border-2 
                          bg-background
                          transition-all duration-200
                          focus:outline-none focus:ring-2 focus:ring-primary/50
                          disabled:opacity-50 disabled:cursor-not-allowed
                          ${digit 
                            ? 'border-primary bg-primary/5 text-primary' 
                            : 'border-muted-foreground/20 hover:border-muted-foreground/40'
                          }
                          ${error ? 'border-destructive/50' : ''}
                        `}
                        aria-label={`Digit ${index + 1}`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Tip: You can paste the full code
                  </p>
                </div>

                {/* Verify Button */}
                <Button
                  type="submit"
                  className="w-full h-12 text-base font-semibold"
                  disabled={isVerifying || !isOtpComplete || !email}
                >
                  {isVerifying ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Verifying...
                    </>
                  ) : isOtpComplete ? (
                    <>
                      <CheckCircle2 className="mr-2 h-5 w-5" />
                      Verify Code
                    </>
                  ) : (
                    'Enter all 6 digits'
                  )}
                </Button>
              </form>

              {/* Resend Section */}
              <div className="mt-8 pt-6 border-t border-border">
                <div className="text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Didn't receive the code?
                  </p>
                  {resendCountdown > 0 ? (
                    <p className="text-sm font-medium text-muted-foreground">
                      Resend available in <span className="text-primary font-bold">{resendCountdown}s</span>
                    </p>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleResendCode}
                      disabled={isLoading || !email}
                      className="gap-2"
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Resend Code
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="mt-8 text-center">
            <button
              onClick={() => router.push('/login')}
              className="text-sm text-muted-foreground hover:text-foreground flex items-center space-x-1 mx-auto transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Sign In</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
