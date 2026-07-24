export const EMAIL_LOGO_URL = 'https://kanvaro.com/EchonLabs.svg'

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function resolveEmailLogoUrl(logoUrl?: string | null): string {
  const trimmedLogoUrl = logoUrl?.trim()
  if (trimmedLogoUrl && /^https:\/\//i.test(trimmedLogoUrl)) {
    return trimmedLogoUrl
  }

  return EMAIL_LOGO_URL
}

export function formatDisplayName(params: {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  fallback?: string
}): string {
  const { firstName, lastName, email, fallback = 'Your administrator' } = params
  const parts = [firstName, lastName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))

  if (parts.length > 0) {
    return parts.join(' ')
  }

  const normalizedEmail = email?.trim()
  if (normalizedEmail) {
    return normalizedEmail
  }

  return fallback
}