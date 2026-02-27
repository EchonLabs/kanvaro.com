import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Pages that should redirect to /dashboard when the user is logged in
const PUBLIC_ONLY_PATHS = ['/', '/landing', '/login', '/forgot-password', '/reset-password', '/verify-otp']

// Path prefixes that require authentication
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/kanban',
  '/backlog',
  '/epics',
  '/calendar',
  '/activity',
  '/notifications',
  '/preferences',
  '/profile',
  '/modules',
  '/feedback',
]

function isAuthenticated(request: NextRequest): boolean {
  return (
    !!request.cookies.get('accessToken')?.value ||
    !!request.cookies.get('refreshToken')?.value
  )
}

function isPublicOnlyPath(pathname: string): boolean {
  return PUBLIC_ONLY_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '?')
  )
}

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const authed = isAuthenticated(request)

  // Redirect authenticated users away from public-only pages
  if (authed && isPublicOnlyPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Redirect unauthenticated users away from protected pages
  if (!authed && isProtectedPath(pathname)) {
    const url = request.nextUrl.clone()
    const returnTo = encodeURIComponent(pathname + request.nextUrl.search)
    url.pathname = '/login'
    url.search = `?returnTo=${returnTo}`
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon|api/|robots\\.txt|sw\\.js|avatars|uploads|set-landing-images\\.html).*)',
  ],
}
