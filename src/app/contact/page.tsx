'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { useTheme } from 'next-themes'
import {
  ArrowLeft,
  Zap,
  Moon,
  Sun,
  Mail,
  MessageCircle,
  Github,
  Twitter,
  Linkedin,
  MapPin,
  Send,
  CheckCircle,
  Loader2
} from 'lucide-react'

export default function ContactPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message')
      }

      setSubmitted(true)
      setFormData({ name: '', email: '', subject: '', message: '' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f6fb] text-slate-900 dark:bg-[#040714] dark:text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-white/10 dark:bg-[#040714]/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => router.push('/landing')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <button
              onClick={() => router.push('/landing')}
              className="flex items-center gap-2 text-xl font-bold cursor-pointer group"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#7bffde] to-[#7afdea] shadow-lg shadow-[#7bffde]/30">
                <Zap className="h-5 w-5 text-slate-900" />
              </div>
              <span className="bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-white/80 bg-clip-text text-transparent">
                Kanvaro
              </span>
            </button>
          </div>
          
          {mounted && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-1 dark:border-white/20 dark:bg-white/5">
              <button
                onClick={() => setTheme('light')}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  theme === 'light'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-white/70'
                }`}
              >
                <Sun className="h-3.5 w-3.5" />
                Light
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  theme === 'dark'
                    ? 'bg-white text-slate-900'
                    : 'text-slate-600 hover:text-slate-900 dark:text-white/70'
                }`}
              >
                <Moon className="h-3.5 w-3.5" />
                Dark
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden px-6 py-20">
        <div className="absolute inset-0 bg-gradient-to-br from-[#f4f8ff] via-[#ffffff] to-[#e8eeff] dark:from-[#050c1d] dark:via-[#0a1030] dark:to-[#071328]" />
        <div className="relative mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold sm:text-5xl lg:text-6xl">
            <span className="bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-white/80 bg-clip-text text-transparent">
              Get in Touch
            </span>
          </h1>
          <p className="mt-6 text-lg text-slate-600 dark:text-white/80 max-w-2xl mx-auto">
            Have questions about Kanvaro? Want to contribute? We'd love to hear from you.
          </p>
        </div>
      </section>

      {/* Contact Section */}
      <section className="px-6 pb-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-12 lg:grid-cols-2">
            {/* Contact Form */}
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-lg dark:border-white/10 dark:bg-[#0f1329]">
              <h2 className="text-2xl font-bold mb-6">Send us a Message</h2>
              
              {submitted ? (
                <div className="text-center py-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 mb-4">
                    <CheckCircle className="h-8 w-8 text-emerald-500" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Message Sent!</h3>
                  <p className="text-slate-600 dark:text-white/70 mb-6">
                    Thank you for reaching out. We'll get back to you as soon as possible.
                  </p>
                  <Button
                    onClick={() => setSubmitted(false)}
                    variant="outline"
                    className="rounded-full"
                  >
                    Send Another Message
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  {error && (
                    <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-600 dark:text-red-400">
                      {error}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium mb-2">Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-[#0d9488] focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 dark:border-white/20 dark:bg-white/5 dark:focus:border-[#7bffde] dark:focus:ring-[#7bffde]/20"
                      placeholder="Your name"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-[#0d9488] focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 dark:border-white/20 dark:bg-white/5 dark:focus:border-[#7bffde] dark:focus:ring-[#7bffde]/20"
                      placeholder="your@email.com"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Subject</label>
                    <input
                      type="text"
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-[#0d9488] focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 dark:border-white/20 dark:bg-white/5 dark:focus:border-[#7bffde] dark:focus:ring-[#7bffde]/20"
                      placeholder="What's this about?"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Message</label>
                    <textarea
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      rows={5}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-[#0d9488] focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 dark:border-white/20 dark:bg-white/5 dark:focus:border-[#7bffde] dark:focus:ring-[#7bffde]/20 resize-none"
                      placeholder="Tell us more..."
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-12 rounded-xl bg-[#0d9488] dark:bg-[#7bffde] text-white dark:text-slate-900 hover:bg-[#0f766e] dark:hover:bg-[#5ce8c5] disabled:opacity-70"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Send Message
                      </>
                    )}
                  </Button>
                </form>
              )}
            </div>

            {/* Contact Info */}
            <div className="space-y-8">
              <div className="rounded-3xl border border-slate-200 bg-white p-8 dark:border-white/10 dark:bg-[#0f1329]">
                <h2 className="text-2xl font-bold mb-6">Other Ways to Reach Us</h2>
                <div className="space-y-6">
                  <a
                    href="mailto:hello@kanvaro.com"
                    className="flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0d9488]/10 dark:bg-[#7bffde]/20">
                      <Mail className="h-6 w-6 text-[#0d9488] dark:text-[#7bffde]" />
                    </div>
                    <div>
                      <p className="font-medium">Email</p>
                      <p className="text-sm text-slate-600 dark:text-white/70">hello@kanvaro.com</p>
                    </div>
                  </a>
                  <a
                    href="https://github.com/kanvaro"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900/10 dark:bg-white/10">
                      <Github className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="font-medium">GitHub</p>
                      <p className="text-sm text-slate-600 dark:text-white/70">github.com/kanvaro</p>
                    </div>
                  </a>
                  <a
                    href="https://twitter.com/kanvaro"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10">
                      <Twitter className="h-6 w-6 text-blue-500" />
                    </div>
                    <div>
                      <p className="font-medium">Twitter</p>
                      <p className="text-sm text-slate-600 dark:text-white/70">@kanvaro</p>
                    </div>
                  </a>
                  <a
                    href="https://linkedin.com/company/kanvaro"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-700/10">
                      <Linkedin className="h-6 w-6 text-blue-700" />
                    </div>
                    <div>
                      <p className="font-medium">LinkedIn</p>
                      <p className="text-sm text-slate-600 dark:text-white/70">Kanvaro</p>
                    </div>
                  </a>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-[#0d9488] to-[#0f766e] dark:from-[#0f1329] dark:to-[#151c3d] p-8 text-white dark:border-white/10">
                <MessageCircle className="h-10 w-10 mb-4" />
                <h3 className="text-xl font-bold mb-2">Community Support</h3>
                <p className="text-white/80 mb-4">
                  Join our community on GitHub Discussions for help, feature requests, and connecting with other users.
                </p>
                <Button
                  onClick={() => window.open('https://github.com/kanvaro/discussions', '_blank')}
                  className="rounded-full bg-white text-[#0d9488] hover:bg-white/90"
                >
                  Join Discussions
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

