import { createHash } from 'crypto'

export interface GravatarOptions {
  size?: number
  default?: '404' | 'mp' | 'identicon' | 'monsterid' | 'wavatar' | 'retro' | 'robohash' | 'blank'
  rating?: 'g' | 'pg' | 'r' | 'x'
  forceDefault?: boolean
}

/**
 * Generate a Gravatar URL for the given email address
 * @param email - The email address to generate a Gravatar for
 * @param options - Optional Gravatar parameters
 * @returns The Gravatar URL
 */
export function getGravatarUrl(email: string, options: GravatarOptions = {}): string {
  if (!email) {
    return ''
  }

  // Normalize email: trim whitespace and convert to lowercase
  const normalizedEmail = email.trim().toLowerCase()
  
  // Create MD5 hash of the email using Node.js built-in crypto
  const hash = createHash('md5').update(normalizedEmail).digest('hex')
  
  // Build the Gravatar URL
  const baseUrl = 'https://www.gravatar.com/avatar/'
  const params = new URLSearchParams()
  
  // Add size parameter (default: 80)
  if (options.size) {
    params.append('s', options.size.toString())
  }
  
  // Add default image parameter
  if (options.default) {
    params.append('d', options.default)
  }
  
  // Add rating parameter (default: g)
  if (options.rating) {
    params.append('r', options.rating)
  }
  
  // Add force default parameter
  if (options.forceDefault) {
    params.append('f', 'y')
  }
  
  const queryString = params.toString()
  return `${baseUrl}${hash}${queryString ? `?${queryString}` : ''}`
}

/**
 * Get user initials from first and last name
 * @param firstName - User's first name
 * @param lastName - User's last name
 * @returns User initials (e.g., "JD" for John Doe)
 */
export function getUserInitials(firstName?: string, lastName?: string): string {
  if (!firstName && !lastName) {
    return 'U'
  }
  
  const firstInitial = firstName?.charAt(0)?.toUpperCase() || ''
  const lastInitial = lastName?.charAt(0)?.toUpperCase() || ''
  
  return firstInitial + lastInitial
}

/**
 * Get avatar URL with Gravatar fallback
 * @param user - User object with avatar, firstName, lastName, and email
 * @param options - Gravatar options
 * @returns Object with avatar URL and fallback initials
 */
export function getAvatarData(
  user: {
    avatar?: string
    firstName?: string
    lastName?: string
    email?: string
  } | null | undefined,
  options: GravatarOptions = {}
) {
  if (!user) {
    return {
      avatarUrl: '',
      fallbackInitials: 'U'
    }
  }

  // If user has a custom avatar, use it
  if (user.avatar) {
    return {
      avatarUrl: user.avatar,
      fallbackInitials: getUserInitials(user.firstName, user.lastName)
    }
  }
  
  // If user has an email, use Gravatar
  if (user.email) {
    return {
      avatarUrl: getGravatarUrl(user.email, options),
      fallbackInitials: getUserInitials(user.firstName, user.lastName)
    }
  }
  
  // Fallback to initials only
  return {
    avatarUrl: '',
    fallbackInitials: getUserInitials(user.firstName, user.lastName)
  }
}
