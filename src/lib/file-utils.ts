import { mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'

/**
 * Ensures a directory exists by creating all parent directories recursively.
 * This function handles permission issues by creating directories one level at a time.
 * 
 * @param dirPath - The full path to the directory that should exist
 * @throws Error if directory cannot be created
 */
export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  // If directory already exists, return early
  if (existsSync(dirPath)) {
    return
  }

  // Get parent directory
  const parentDir = dirname(dirPath)
  
  // Recursively ensure parent directories exist first
  if (parentDir !== dirPath && !existsSync(parentDir)) {
    await ensureDirectoryExists(parentDir)
  }

  // Create the directory with recursive option
  // This will handle cases where some parent directories might have been created
  // between the check and the actual creation
  try {
    await mkdir(dirPath, { recursive: true })
  } catch (error: any) {
    // If directory was created by another process between check and creation, ignore
    if (error.code === 'EEXIST') {
      return
    }
    // Re-throw other errors with more context
    throw new Error(
      `Failed to create directory "${dirPath}": ${error.message}. ` +
      `Please ensure the application has write permissions to create directories.`
    )
  }
}

/**
 * Gets the upload directory path for a specific upload type
 * @param type - The type of upload (e.g., 'logos', 'avatars')
 * @returns The full path to the upload directory
 */
export function getUploadDirectory(type: string): string {
  // Check for environment variable first (for containerized environments)
  const baseUploadDir = process.env.UPLOADS_DIR || process.env.UPLOAD_DIR || process.env.UPLOAD_PATH
  
  if (baseUploadDir) {
    // If UPLOADS_DIR is set, use it as the base directory
    // It should be an absolute path or relative to process.cwd()
    const basePath = baseUploadDir.startsWith('/') 
      ? baseUploadDir 
      : join(process.cwd(), baseUploadDir)
    return join(basePath, type)
  }
  
  // Default: use public/uploads (for local development)
  // For containerized environments, set UPLOADS_DIR environment variable
  // to a writable path like /tmp/uploads or /app/uploads
  return join(process.cwd(), 'public', 'uploads', type)
}

/**
 * Gets the public URL path for an uploaded file
 * If files are stored outside public directory, returns API route path
 * In standalone/production mode, always uses API route for reliability
 * @param type - The type of upload (e.g., 'logos', 'avatars')
 * @param filename - The filename
 * @returns The public URL path for the file
 */
export function getUploadUrl(type: string, filename: string): string {
  // In production or when UPLOADS_DIR is set, always use API route
  // This ensures files are served correctly in standalone mode
  const isProduction = process.env.NODE_ENV === 'production'
  const baseUploadDir = process.env.UPLOADS_DIR || process.env.UPLOAD_DIR || process.env.UPLOAD_PATH
  
  if (isProduction || baseUploadDir) {
    // Get the actual upload directory path
    const uploadDir = getUploadDirectory(type)
    const publicDir = join(process.cwd(), 'public')
    
    // Normalize paths for comparison (resolve relative paths and remove trailing slashes)
    const normalizedUploadDir = uploadDir.replace(/\/+$/, '')
    const normalizedPublicDir = publicDir.replace(/\/+$/, '')
    
    // If files are stored outside public directory, use API route
    if (!normalizedUploadDir.startsWith(normalizedPublicDir + '/') && normalizedUploadDir !== normalizedPublicDir) {
      return `/api/uploads/${type}/${filename}`
    }
    
    // In production/standalone mode, even if files are in public, use API route for reliability
    // as the public directory might not be accessible in standalone builds
    if (isProduction) {
      return `/api/uploads/${type}/${filename}`
    }
  }
  
  // Development mode with files in public directory, use direct path
  return `/uploads/${type}/${filename}`
}

/**
 * Converts a legacy /uploads/... URL to the correct API route if needed
 * This is useful for handling existing URLs in the database
 * @param url - The URL path (e.g., '/uploads/logos/file.jpg')
 * @returns The corrected URL path (either unchanged or converted to /api/uploads/...)
 */
export function normalizeUploadUrl(url: string): string {
  // Only process URLs that start with /uploads/
  if (!url || !url.startsWith('/uploads/')) {
    return url
  }
  
  // Extract type and filename from URL
  // Format: /uploads/{type}/{filename}
  const parts = url.replace(/^\/uploads\//, '').split('/')
  if (parts.length < 2) {
    return url
  }
  
  const type = parts[0]
  const filename = parts.slice(1).join('/')
  
  // In production or when UPLOADS_DIR is set, always use API route
  const isProduction = process.env.NODE_ENV === 'production'
  const baseUploadDir = process.env.UPLOADS_DIR || process.env.UPLOAD_DIR || process.env.UPLOAD_PATH
  
  if (isProduction || baseUploadDir) {
    // Check if files are actually stored outside public directory
    const uploadDir = getUploadDirectory(type)
    const publicDir = join(process.cwd(), 'public')
    
    const normalizedUploadDir = uploadDir.replace(/\/+$/, '')
    const normalizedPublicDir = publicDir.replace(/\/+$/, '')
    
    // If files are stored outside public, convert /uploads/ to /api/uploads/
    if (!normalizedUploadDir.startsWith(normalizedPublicDir + '/') && normalizedUploadDir !== normalizedPublicDir) {
      return `/api/uploads/${type}/${filename}`
    }
    
    // In production/standalone mode, always use API route for reliability
    if (isProduction) {
      return `/api/uploads/${type}/${filename}`
    }
  }
  
  return url
}

