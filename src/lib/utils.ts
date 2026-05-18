import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount)
}

export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

export function generateId(): string {
  return Math.random().toString(36).substr(2, 9)
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w ]+/g, '')
    .replace(/ +/g, '-')
}

/**
 * Converts text to Title Case
 * Handles snake_case, kebab-case, UPPERCASE, and regular lowercase text
 * Examples:
 *   "in_progress" -> "In Progress"
 *   "team_member" -> "Team Member"
 *   "PROJECT_MANAGER" -> "Project Manager"
 *   "project_manager" -> "Project Manager"
 *   "admin" -> "Admin"
 *   "ADMIN" -> "Admin"
 */
export function formatToTitleCase(text: string | undefined | null): string {
  if (!text) return ''
  
  // Convert to lowercase first, then split and capitalize
  return text
    .toLowerCase()
    .split(/[_\-\s]+/) // Split on underscore, hyphen, or whitespace
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Applies rounding rules to a time duration in minutes
 * @param duration - Duration in minutes
 * @param roundingRules - Rounding rules configuration
 * @returns Rounded duration in minutes
 */
export function applyRoundingRules(
  duration: number,
  roundingRules: { enabled: boolean; increment: number; roundUp: boolean }
): number {
  if (!roundingRules.enabled || duration <= 0) {
    return duration
  }

  const increment = roundingRules.increment

  // Convert total minutes to hours and minutes
  const totalHours = Math.floor(duration / 60)
  const remainingMinutes = duration % 60

  // Round the minute component
  let roundedMinutes: number
  if (roundingRules.roundUp) {
    // Round up to nearest increment
    roundedMinutes = Math.ceil(remainingMinutes / increment) * increment
    // If rounding up minutes exceeds 60, it will carry over to hours in the display
  } else {
    // Round down to nearest increment
    roundedMinutes = Math.floor(remainingMinutes / increment) * increment
  }

  // Convert back to total minutes
  return totalHours * 60 + roundedMinutes
}

/**
 * Utility to focus and select text in a search input within a dropdown/select component.
 * Uses requestAnimationFrame to ensure the focus happens after the dropdown is rendered.
 */
export const focusSearchInput = (el: HTMLInputElement | null) => {
  if (!el || el.disabled) return

  const doFocus = () => {
    el.focus({ preventScroll: true })
    try {
      el.select?.()
    } catch {
      // ignore
    }
  }

  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(doFocus)
  } else {
    setTimeout(doFocus, 0)
  }
}

/**
 * Truncates a string to a maximum character length and appends "..." if truncated
 * @param text - The text to truncate
 * @param maxLength - Maximum length before truncation (default: 30)
 * @returns Truncated text with "..." if it exceeds maxLength
 */
export function truncateText(text?: string, maxLength: number = 30): { truncated: string; isTruncated: boolean } {
  if (!text) return { truncated: '', isTruncated: false }
  
  if (text.length <= maxLength) {
    return { truncated: text, isTruncated: false }
  }
  
  return { truncated: `${text.slice(0, maxLength)}...`, isTruncated: true }
}
