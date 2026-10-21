/**
 * The absolute base URL to put in an outbound notification link.
 *
 * Notification emails carry a link back into the app, so a wrong answer here
 * is a dead link in somebody's inbox rather than a caught error. That is why
 * this reaches past `host` for `origin`/`referer` first: behind a proxy, `host`
 * is usually the internal hostname, while the browser's own origin is the
 * domain the recipient can actually reach.
 *
 * Extracted from the task update route, which grew this logic inline and was
 * about to have it copied into the planning assignment route.
 */
export interface BaseUrlHeaders {
  get(name: string): string | null
}

export function resolveBaseUrl(request: { headers: BaseUrlHeaders }): string {
  // An explicit setting always wins — it is the only source that cannot be
  // spoofed by a request header, and is what production should be using.
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  }

  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const originHeader = request.headers.get('origin')
  const refererHeader = request.headers.get('referer')
  const hostHeader = request.headers.get('host')

  let extractedHost: string | null = null
  let extractedProtocol: string | null = null

  for (const candidate of [originHeader, refererHeader]) {
    if (extractedHost || !candidate) continue
    try {
      const url = new URL(candidate)
      extractedHost = url.host
      extractedProtocol = url.protocol.replace(':', '')
    } catch {
      /* A malformed origin or referer is simply not a source; try the next. */
    }
  }

  let protocol: string
  if (extractedProtocol) {
    protocol = extractedProtocol
  } else if (forwardedProto) {
    // A proxy chain sends a comma-separated list; the first entry is the one
    // the client actually spoke.
    protocol = forwardedProto.split(',')[0].trim()
  } else if (hostHeader?.includes('localhost') || hostHeader?.includes('127.0.0.1')) {
    protocol = 'http'
  } else {
    protocol = 'https'
  }

  let host: string
  if (extractedHost && !extractedHost.includes('localhost') && !extractedHost.includes('127.0.0.1')) {
    host = extractedHost
  } else if (forwardedHost) {
    host = forwardedHost.split(',')[0].trim()
  } else if (hostHeader) {
    host = hostHeader.replace(/^https?:\/\//, '')
  } else {
    host = 'localhost:3000'
    protocol = 'http'
  }

  host = host
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    // Default ports are noise in a link and break exact-match comparisons.
    .replace(/^(.+):80$/, '$1')
    .replace(/^(.+):443$/, '$1')

  return `${protocol}://${host}`
}
