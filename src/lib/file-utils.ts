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
  return join(process.cwd(), 'public', 'uploads', type)
}

