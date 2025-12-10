import { writeFile } from 'fs/promises'
import { join } from 'path'
import { ensureDirectoryExists, getUploadDirectory, getUploadUrl } from './file-utils'

/**
 * Generate a color based on user initials/name
 * Creates consistent colors for the same input
 */
function generateColorFromName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  
  // Generate a color in HSL format with good saturation and lightness
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 65%, 50%)`
}

/**
 * Generate user initials from first and last name
 */
function getUserInitials(firstName: string, lastName: string): string {
  const firstInitial = firstName?.charAt(0)?.toUpperCase() || ''
  const lastInitial = lastName?.charAt(0)?.toUpperCase() || ''
  const initials = (firstInitial + lastInitial).trim()
  return initials || 'U'
}

/**
 * Generate an SVG avatar with initials
 */
function generateSVGAvatar(initials: string, backgroundColor: string, size: number = 200): string {
  const fontSize = size * 0.4
  const textY = size * 0.6
  
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="${backgroundColor}" rx="${size / 2}"/>
    <text 
      x="50%" 
      y="${textY}" 
      font-family="Arial, sans-serif" 
      font-size="${fontSize}" 
      font-weight="bold" 
      fill="white" 
      text-anchor="middle" 
      dominant-baseline="middle"
    >${initials}</text>
  </svg>`
}

/**
 * Generate and save an avatar image for a user
 * @param userId - User ID
 * @param firstName - User's first name
 * @param lastName - User's last name
 * @returns The URL path to the generated avatar
 */
export async function generateAvatarImage(
  userId: string,
  firstName: string,
  lastName: string
): Promise<string> {
  try {
    // Generate initials
    const initials = getUserInitials(firstName, lastName)
    
    // Generate consistent color based on name
    const fullName = `${firstName} ${lastName}`.trim() || initials
    const backgroundColor = generateColorFromName(fullName)
    
    // Generate SVG
    const svgContent = generateSVGAvatar(initials, backgroundColor, 200)
    
    // Ensure avatars directory exists
    const avatarsDir = getUploadDirectory('avatars')
    await ensureDirectoryExists(avatarsDir)
    
    // Generate filename
    const fileName = `${userId}-${Date.now()}.svg`
    const filePath = join(avatarsDir, fileName)
    
    // Save SVG file
    await writeFile(filePath, svgContent, 'utf-8')
    
    // Return the URL path
    return getUploadUrl('avatars', fileName)
  } catch (error) {
    console.error('Error generating avatar:', error)
    throw new Error('Failed to generate avatar image')
  }
}

