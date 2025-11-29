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
  if (roundingRules.roundUp) {
    // Round up to nearest increment
    return Math.ceil(duration / increment) * increment
  } else {
    // Round down to nearest increment
    return Math.floor(duration / increment) * increment
  }
}