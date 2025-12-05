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
  Shield,
  Users,
  Globe,
  Heart,
  Code,
  Target
} from 'lucide-react'

export default function AboutPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

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
              About Kanvaro
            </span>
          </h1>
          <p className="mt-6 text-lg text-slate-600 dark:text-white/80 max-w-2xl mx-auto">
            We're building the future of project management – open source, self-hosted, and designed for teams who value control, flexibility, and transparency.
          </p>
        </div>
      </section>

      {/* Mission Section */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-6">Our Mission</h2>
              <p className="text-lg text-slate-600 dark:text-white/80 mb-6 leading-relaxed">
                Kanvaro was born from the belief that every team deserves powerful project management tools without sacrificing data privacy or paying enterprise-level prices.
              </p>
              <p className="text-lg text-slate-600 dark:text-white/80 leading-relaxed">
                We're committed to building an open-source solution that gives organizations complete control over their data while providing all the features needed to manage projects, track time, and deliver results.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-6">
              {[
                { icon: <Shield className="h-8 w-8 text-[#0d9488] dark:text-[#7bffde]" />, title: 'Privacy First', desc: 'Your data stays on your servers' },
                { icon: <Code className="h-8 w-8 text-[#6366f1]" />, title: 'Open Source', desc: 'Transparent and community-driven' },
                { icon: <Globe className="h-8 w-8 text-[#d946ef]" />, title: 'Global Teams', desc: 'Built for distributed work' },
                { icon: <Heart className="h-8 w-8 text-[#f43f5e]" />, title: 'Community', desc: 'Powered by our users' }
              ].map((item) => (
                <div key={item.title} className="group rounded-2xl border border-slate-200 bg-white p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-lg hover:border-[#7bffde]/30 dark:border-white/10 dark:bg-[#0f1329] dark:hover:border-[#7bffde]/40 dark:hover:shadow-[0_20px_40px_rgba(123,255,222,0.15)]">
                  {item.icon}
                  <h3 className="mt-4 font-bold group-hover:text-[#0d9488] dark:group-hover:text-[#7bffde] transition-colors">{item.title}</h3>
                  <p className="mt-2 text-sm text-slate-600 dark:text-white/70">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="px-6 py-16 bg-white dark:bg-[#0a1020]">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold text-center mb-12">Our Values</h2>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                icon: <Target className="h-10 w-10 text-[#0d9488] dark:text-[#7bffde]" />,
                title: 'Transparency',
                description: 'Open source means open development. See our code, contribute features, report issues, and help shape the future of Kanvaro.'
              },
              {
                icon: <Users className="h-10 w-10 text-[#6366f1]" />,
                title: 'Community First',
                description: 'Built with and for our community. Every feature request, bug report, and contribution helps make Kanvaro better for everyone.'
              },
              {
                icon: <Shield className="h-10 w-10 text-[#d946ef]" />,
                title: 'Data Sovereignty',
                description: 'Your data belongs to you. Self-host on your infrastructure and maintain complete control over your information.'
              }
            ].map((value) => (
              <div key={value.title} className="group text-center p-8 rounded-3xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0f1329] transition-all duration-300 hover:-translate-y-2 hover:shadow-lg hover:border-[#7bffde]/30 dark:hover:border-[#7bffde]/40 dark:hover:shadow-[0_20px_40px_rgba(123,255,222,0.15)]">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white dark:bg-white/10 mb-6 group-hover:scale-110 transition-transform">
                  {value.icon}
                </div>
                <h3 className="text-xl font-bold mb-4 group-hover:text-[#0d9488] dark:group-hover:text-[#7bffde] transition-colors">{value.title}</h3>
                <p className="text-slate-600 dark:text-white/70 leading-relaxed">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold mb-6">Join Our Community</h2>
          <p className="text-lg text-slate-600 dark:text-white/80 mb-8 max-w-2xl mx-auto">
            Be part of the open-source movement. Contribute, suggest features, or just say hello.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={() => window.open('https://github.com/EchonLabs/kanvaro.com', '_blank')}
              className="h-12 rounded-full bg-slate-900 dark:bg-white px-8 text-white dark:text-slate-900"
            >
              View on GitHub
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push('/contact')}
              className="h-12 rounded-full px-8"
            >
              Contact Us
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
}

