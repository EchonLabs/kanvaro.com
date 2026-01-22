import type { Metadata } from 'next'
// import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { PermissionProvider } from '@/lib/permissions/permission-context'
import { ToastProviderWrapper } from '@/components/providers/ToastProviderWrapper'
import { TooltipProvider } from '@/components/ui/tooltip'

// Use system fonts for better reliability
const fontClass = "font-sans"

export const metadata: Metadata = {
  title: 'Kanvaro - Project Management Solution',
  description: 'Self-hosted project management solution for modern teams',
  icons: {
    icon: '/favicon.svg',
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Server-side fetch to hydrate permissions early
  let initialPermissions: any = null
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/auth/permissions`, {
      // Ensure we don't cache user-scoped permissions
      cache: 'no-store',
      // Next.js server fetch will forward cookies automatically for same-origin URLs
    })
    if (res.ok) {
      initialPermissions = await res.json()
    }
  } catch (_) {
    // Silently ignore; client will fall back to fetching
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${fontClass} antialiased overflow-y-hidden`} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            <PermissionProvider initialPermissions={initialPermissions}>
              <ToastProviderWrapper>
                {children}
              </ToastProviderWrapper>
            </PermissionProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
