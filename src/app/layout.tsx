import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { PermissionProvider } from '@/lib/permissions/permission-context'

const inter = Inter({ subsets: ['latin'] })

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
      <body className={`${inter.className} min-h-screen overflow-x-hidden antialiased`} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <PermissionProvider initialPermissions={initialPermissions}>
            {children}
          </PermissionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
